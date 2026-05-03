# backend/app/routers/classes.py
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging
from pathlib import Path
from app.core.db import db_conn
from app.dependencies import get_request_user_uid
from app.core.settings import settings
from app.core.storage import get_object_bytes, get_s3_client, presign_get_url
from app.services.document_ingestion import _docx_text_pages, _pptx_text_pages
from app.services.document_preview_state import generate_office_preview, sync_existing_office_preview, viewer_url
from app.services.pptx_preview import converted_pdf_path, preview_dir
from app.lib.stored_document_paths import resolve_local_original_file

log = logging.getLogger("uvicorn.error")
log.info("Loaded classes router from %s", __file__)

router = APIRouter(prefix="/api/classes", tags=["classes"])
UPLOAD_ROOT = Path(settings.upload_root)

class ClassCreate(BaseModel):
    name: str
    subject: Optional[str] = None

class ClassUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None


async def _persist_storage_key_if_changed(document_id: str, previous_key: str | None, new_rel: str) -> None:
    if (previous_key or "").strip() == new_rel.strip():
        return
    async with db_conn() as (conn, cur):
        await cur.execute(
            "UPDATE files SET storage_key=%s WHERE id=%s",
            (new_rel, document_id),
        )
        await conn.commit()
    log.info(
        "[classes] repaired storage_key document_id=%s old=%r new=%r",
        document_id,
        previous_key,
        new_rel,
    )


async def _document_bytes_async(
    storage_key: str | None,
    storage_url: str | None,
    storage_backend: str | None,
    *,
    document_id: str,
    class_id: int,
    display_filename: str | None = None,
    context: str = "document_bytes",
) -> bytes:
    backend = (storage_backend or settings.storage_backend or "local").lower()
    if backend == "s3":
        if not storage_key:
            log.warning(
                "[classes] document_bytes missing storage_key document_id=%s class_id=%s backend=s3",
                document_id,
                class_id,
            )
            raise HTTPException(
                status_code=404,
                detail="Stored file reference is missing. Try re-uploading the document.",
            )
        log.info(
            "[classes] document_bytes s3 fetch document_id=%s class_id=%s key_prefix=%s",
            document_id,
            class_id,
            (str(storage_key)[:80] + "...") if storage_key and len(str(storage_key)) > 80 else storage_key,
        )
        return get_object_bytes(storage_key)

    file_path, new_rel = resolve_local_original_file(
        UPLOAD_ROOT,
        class_id,
        document_id,
        storage_key,
        storage_url,
        hint_display_filename=display_filename,
        context=context,
    )
    if not file_path or not new_rel:
        log.warning(
            "[classes] document_bytes could not resolve local path document_id=%s class_id=%s "
            "has_key=%s key_is_s3_style=%s storage_url_set=%s",
            document_id,
            class_id,
            bool(storage_key),
            str(storage_key or "").startswith("notescape/"),
            bool(storage_url),
        )
        raise HTTPException(status_code=404, detail="File not found")
    await _persist_storage_key_if_changed(document_id, storage_key, new_rel.as_posix())
    log.info(
        "[classes] document_bytes local read document_id=%s class_id=%s size_bytes=%s rel=%s",
        document_id,
        class_id,
        file_path.stat().st_size,
        new_rel,
    )
    return file_path.read_bytes()


def _decode_text_preview(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _is_pptx(filename: str | None, mime_type: str | None) -> bool:
    return (
        str(mime_type or "").lower() == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        or str(filename or "").lower().endswith(".pptx")
    )


def _is_docx(filename: str | None, mime_type: str | None) -> bool:
    mt = str(mime_type or "").lower().split(";")[0].strip()
    return (
        mt == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or str(filename or "").lower().endswith(".docx")
    )


def _is_old_ppt(filename: str | None, mime_type: str | None) -> bool:
    return str(mime_type or "").lower() == "application/vnd.ms-powerpoint" or str(filename or "").lower().endswith(".ppt")


def _preview_dir(document_id: str) -> Path:
    return preview_dir(document_id)


def _asset_url(class_id: int, document_id: str, filename: str) -> str:
    return f"/api/classes/{class_id}/documents/{document_id}/preview-assets/{filename}"


def _original_file_path_for_logs(
    storage_key: str | None,
    storage_url: str | None,
    storage_backend: str | None,
    *,
    class_id: int,
    document_id: str,
    filename: str | None,
    context: str,
) -> str | None:
    backend = (storage_backend or settings.storage_backend or "local").lower()
    if backend != "local":
        return str(storage_key or storage_url or "")
    path, _rel = resolve_local_original_file(
        UPLOAD_ROOT,
        class_id,
        document_id,
        storage_key,
        storage_url,
        hint_display_filename=filename,
        context=context,
    )
    return str(path) if path else None


def _storage_debug_stat(
    storage_key: str | None,
    storage_url: str | None,
    storage_backend: str | None,
    *,
    class_id: int,
    document_id: str,
    filename: str | None,
) -> dict[str, object]:
    backend = (storage_backend or settings.storage_backend or "local").lower()
    if backend == "s3":
        original_path = f"s3://{settings.s3_bucket}/{storage_key}" if storage_key else None
        exists = False
        size = 0
        if storage_key:
            try:
                head = get_s3_client().head_object(Bucket=settings.s3_bucket, Key=storage_key)
                exists = True
                size = int(head.get("ContentLength") or 0)
            except Exception as exc:
                log.warning("[PPTX_PREVIEW] original S3 head failed document_id=%s err=%s", document_id, exc)
        return {
            "original_file_path": original_path,
            "original_file_exists": exists,
            "original_file_size": size,
        }

    path, _rel = resolve_local_original_file(
        UPLOAD_ROOT,
        class_id,
        document_id,
        storage_key,
        storage_url,
        hint_display_filename=filename,
        context="preview_debug",
    )
    return {
        "original_file_path": str(path) if path else None,
        "original_file_exists": bool(path and path.exists()),
        "original_file_size": path.stat().st_size if path and path.exists() else 0,
    }


@router.get("")  # GET /api/classes
async def list_classes(user_uid: str = Depends(get_request_user_uid)) -> List[Dict[str, Any]]:
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT id, name, subject, created_at FROM classes "
            "WHERE owner_uid = %s ORDER BY created_at DESC",
            (user_uid,),
        )
        rows = await cur.fetchall()
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in rows]


@router.post("")  # POST /api/classes
async def create_class(
    payload: ClassCreate, user_uid: str = Depends(get_request_user_uid)
):
    subject = (payload.subject or "").strip() or "General"
    async with db_conn() as (conn, cur):
        await cur.execute(
            "INSERT INTO classes (name, subject, owner_uid) VALUES (%s, %s, %s) "
            "RETURNING id, name, subject, created_at",
            (payload.name, subject, user_uid),
        )
        row = await cur.fetchone()
        await conn.commit()
    cols = ["id", "name", "subject", "created_at"]
    return dict(zip(cols, row))


@router.put("/{class_id}")  # PUT /api/classes/{class_id}
async def update_class(
    class_id: int, payload: ClassUpdate, user_uid: str = Depends(get_request_user_uid)
):
    fields, values = [], []
    if payload.name is not None:
        fields.append("name=%s")
        values.append(payload.name)
    if payload.subject is not None:
        fields.append("subject=%s")
        values.append((payload.subject or "").strip() or "General")
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    values.append(class_id)
    values.append(user_uid)  # For ownership check
    async with db_conn() as (conn, cur):
        await cur.execute(
            f"UPDATE classes SET {', '.join(fields)} "
            "WHERE id=%s AND owner_uid=%s RETURNING id, name, subject, created_at",
            tuple(values),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Class not found or not owned by you")
        await conn.commit()
    cols = ["id", "name", "subject", "created_at"]
    return dict(zip(cols, row))


@router.delete("/{class_id}", status_code=204)  # DELETE /api/classes/{class_id}
async def delete_class(class_id: int, user_uid: str = Depends(get_request_user_uid)):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "DELETE FROM classes WHERE id=%s AND owner_uid=%s",
            (class_id, user_uid),
        )
        await conn.commit()
    return

@router.get("/{class_id}/documents/{document_id}/download")
async def download_document(
    class_id: int,
    document_id: str,
    user_uid: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT files.storage_key, files.storage_url, files.mime_type, files.filename, files.storage_backend,
                   files.status, files.indexed_at, files.viewer_file_url, files.viewer_status, files.conversion_error
            FROM files
            JOIN classes ON classes.id = files.class_id
            WHERE files.id=%s AND files.class_id=%s AND classes.owner_uid=%s
            """,
            (document_id, class_id, user_uid),
        )
        row = await cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    (
        storage_key,
        storage_url,
        mime_type,
        filename,
        storage_backend,
        content_status,
        indexed_at,
        viewer_file_url_db,
        viewer_status_db,
        conversion_error_db,
    ) = row
    log.info(
        "[classes] download_request class_id=%s document_id=%s backend=%r has_storage_key=%s",
        class_id,
        document_id,
        storage_backend,
        bool(storage_key),
    )

    if storage_backend and storage_backend.lower() == "s3" and storage_key:
        url = presign_get_url(storage_key, expires_seconds=3600)
        return RedirectResponse(url=url, status_code=307)

    file_path, new_rel = resolve_local_original_file(
        UPLOAD_ROOT,
        class_id,
        document_id,
        storage_key,
        storage_url,
        hint_display_filename=filename,
        context="download",
    )
    if not file_path or not new_rel:
        log.warning(
            "[classes] download could not resolve local path document_id=%s class_id=%s has_key=%s",
            document_id,
            class_id,
            bool(storage_key),
        )
        raise HTTPException(status_code=404, detail="File not found")

    await _persist_storage_key_if_changed(document_id, storage_key, new_rel.as_posix())

    media = mime_type
    if not media and str(filename or "").lower().endswith(".pptx"):
        media = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    return FileResponse(file_path, media_type=media or "application/octet-stream", filename=filename)

@router.get("/{class_id}/documents/{document_id}/view-url")
async def get_document_view_url(
    class_id: int,
    document_id: str,
    user_uid: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT files.storage_key,
                   files.storage_url,
                   files.storage_backend,
                   files.mime_type,
                   files.filename,
                   files.indexed_at,
                   files.viewer_file_url,
                   files.viewer_status,
                   files.conversion_error
            FROM files
            JOIN classes ON classes.id = files.class_id
            WHERE files.id=%s AND files.class_id=%s AND classes.owner_uid=%s
            """,
            (document_id, class_id, user_uid),
        )
        row = await cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    storage_key, storage_url, storage_backend, mime_type, filename, indexed_at, viewer_file_url, viewer_status, conversion_error = row
    if (_is_pptx(filename, mime_type) or _is_docx(filename, mime_type)):
        log.info(
            "[OFFICE_PREVIEW] get_document_view_url office document, generating/syncing preview document_id=%s",
            document_id,
        )
        pdf_path = converted_pdf_path(document_id)
        if pdf_path.exists() and pdf_path.stat().st_size > 0 and (viewer_status != "ready" or viewer_file_url != viewer_url(class_id, document_id)):
            synced = await sync_existing_office_preview(document_id, class_id)
            viewer_file_url = synced.get("viewer_file_url")
            viewer_status = synced.get("viewer_status")
            conversion_error = synced.get("conversion_error")
        if viewer_status == "ready" and viewer_file_url:
            return {"url": viewer_file_url, "content_type": "application/pdf"}
        if indexed_at is not None:
            data = await _document_bytes_async(
                storage_key,
                storage_url,
                storage_backend,
                document_id=document_id,
                class_id=class_id,
                display_filename=filename,
                context="view_url_generate",
            )
            result = await generate_office_preview(
                document_id=document_id,
                class_id=class_id,
                data=data,
                kind="pptx" if _is_pptx(filename, mime_type) else "docx",
                original_file_path=_original_file_path_for_logs(
                    storage_key,
                    storage_url,
                    storage_backend,
                    class_id=class_id,
                    document_id=document_id,
                    filename=filename,
                    context="view_url_generate",
                ),
            )
            viewer_file_url = result.get("viewer_file_url")
            viewer_status = result.get("viewer_status")
            conversion_error = result.get("conversion_error")
            log.info("[OFFICE_PREVIEW] generated viewer_file_url=%s document_id=%s", viewer_file_url, document_id)
            if viewer_status == "ready" and viewer_file_url:
                return {"url": viewer_file_url, "content_type": "application/pdf"}
        if viewer_status == "failed":
            raise HTTPException(status_code=409, detail=conversion_error or "Preview generation failed.")
        raise HTTPException(status_code=409, detail=conversion_error or "Preview is not ready yet.")
    if viewer_status == "ready" and viewer_file_url:
        return {"url": viewer_file_url, "content_type": "application/pdf"}
    if storage_backend and storage_backend.lower() == "s3" and storage_key:
        url = presign_get_url(storage_key, expires_seconds=300)
        return {"url": url, "content_type": mime_type}

    url = f"/api/classes/{class_id}/documents/{document_id}/download"
    return {"url": url, "content_type": mime_type}


@router.get("/{class_id}/documents/{document_id}")
async def get_document_metadata(
    class_id: int,
    document_id: str,
    user_uid: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT files.id::text,
                   files.filename,
                   files.mime_type,
                   files.status,
                   COALESCE(files.processing_progress, 0) AS processing_progress,
                   files.indexed_at,
                   files.last_error,
                   files.preview_error,
                   COUNT(file_chunks.id)::int AS chunk_count,
                   files.document_type,
                   files.preview_type,
                   files.preview_key,
                   files.viewer_file_url,
                   files.viewer_file_path,
                   files.viewer_file_type,
                   files.viewer_status,
                   files.conversion_error,
                   files.original_file_url,
                   files.original_file_path
            FROM files
            JOIN classes ON classes.id = files.class_id
            LEFT JOIN file_chunks ON file_chunks.file_id = files.id
            WHERE files.id=%s AND files.class_id=%s AND classes.owner_uid=%s
            GROUP BY files.id, files.filename, files.mime_type, files.status, files.processing_progress,
                     files.indexed_at, files.last_error, files.preview_error, files.document_type,
                     files.preview_type, files.preview_key, files.viewer_file_url, files.viewer_file_path,
                     files.viewer_file_type, files.viewer_status, files.conversion_error,
                     files.original_file_url, files.original_file_path
            """,
            (document_id, class_id, user_uid),
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    filename = row[1]
    mime_type = row[2]
    document_type_db = row[9]
    preview_type_db = row[10]
    preview_key_db = row[11]
    viewer_file_url_db = row[12]
    viewer_file_path_db = row[13]
    viewer_file_type_db = row[14]
    viewer_status_db = row[15]
    conversion_error_db = row[16]
    original_file_url_db = row[17]
    original_file_path_db = row[18]
    doc_type = (
        (document_type_db or "").strip().lower()
        or (
            "pptx"
            if _is_pptx(filename, mime_type)
            else (
                "docx"
                if _is_docx(filename, mime_type)
                else (
                    "pdf"
                    if str(filename or "").lower().endswith(".pdf") or "pdf" in str(mime_type or "").lower()
                    else "text"
                )
            )
        )
    )
    pdf_on_disk = converted_pdf_path(document_id).exists() and converted_pdf_path(document_id).stat().st_size > 0
    if doc_type in {"pptx", "docx"} and pdf_on_disk and (
        viewer_status_db != "ready" or viewer_file_url_db != viewer_url(class_id, document_id) or not viewer_file_path_db
    ):
        synced = await sync_existing_office_preview(document_id, class_id)
        viewer_file_url_db = synced.get("viewer_file_url")
        viewer_file_path_db = str(converted_pdf_path(document_id))
        viewer_file_type_db = "pdf"
        viewer_status_db = "ready"
        conversion_error_db = None
    preview_type_effective = (preview_type_db or "").strip().lower() or (
        "pdf" if doc_type == "pdf" or (doc_type in {"pptx", "docx"} and pdf_on_disk) else ("image" if str(mime_type or "").lower().startswith("image/") else "text")
    )
    indexing_ready = row[8] > 0 and row[5] is not None
    preview_ready = doc_type == "pdf" or pdf_on_disk or preview_type_effective == "pdf"
    return {
        "id": row[0],
        "filename": filename,
        "mime_type": mime_type,
        "type": doc_type,
        "document_type": doc_type,
        "preview_type": preview_type_effective if preview_ready or doc_type in {"pptx", "docx", "pdf"} else preview_type_db,
        "preview_key": preview_key_db,
        "status": row[3],
        "processing_progress": row[4],
        "indexed_at": row[5],
        "last_error": row[6],
        "preview_error": row[7],
        "chunk_count": row[8],
        "viewer_file_url": viewer_file_url_db,
        "viewer_file_path": viewer_file_path_db,
        "viewer_file_type": viewer_file_type_db,
        "viewer_status": viewer_status_db or ("ready" if doc_type in {"pdf", "text"} else ("ready" if pdf_on_disk else "missing")),
        "conversion_error": conversion_error_db,
        "original_file_url": original_file_url_db,
        "original_file_path": original_file_path_db,
        "preview_available": doc_type in {"pdf", "text"} or bool(viewer_file_url_db) or preview_ready,
        "preview_ready": doc_type in {"pdf", "text"} or bool(viewer_file_url_db) or preview_ready,
        "indexing_ready": indexing_ready,
        "study_ready": indexing_ready,
    }


@router.get("/{class_id}/documents/{document_id}/preview")
async def preview_document(
    class_id: int,
    document_id: str,
    user_uid: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT files.storage_key,
                   files.storage_url,
                   files.mime_type,
                   files.filename,
                   files.storage_backend,
                   files.status,
                   files.indexed_at,
                   files.viewer_file_url,
                   files.viewer_status,
                   files.conversion_error
            FROM files
            JOIN classes ON classes.id = files.class_id
            WHERE files.id=%s AND files.class_id=%s AND classes.owner_uid=%s
            """,
            (document_id, class_id, user_uid),
        )
        row = await cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    (
        storage_key,
        storage_url,
        mime_type,
        filename,
        storage_backend,
        content_status,
        indexed_at,
        viewer_file_url_db,
        viewer_status_db,
        conversion_error_db,
    ) = row
    log.info(
        "[classes] preview_request class_id=%s document_id=%s filename=%r mime=%r backend=%r has_storage_key=%s",
        class_id,
        document_id,
        filename,
        mime_type,
        storage_backend,
        bool(storage_key),
    )
    log.info("[OFFICE_PREVIEW] preview requested document_id=%s", document_id)
    filename_lower = str(filename or "").lower()
    mime_lower = str(mime_type or "").lower()
    data = await _document_bytes_async(
        storage_key,
        storage_url,
        storage_backend,
        document_id=document_id,
        class_id=class_id,
        display_filename=filename,
        context="preview",
    )

    try:
        if _is_old_ppt(filename, mime_type):
            raise HTTPException(
                status_code=415,
                detail="Old .ppt files are not supported yet. Please upload .pptx or PDF.",
            )

        if _is_pptx(filename, mime_type):
            try:
                pages = _pptx_text_pages(data)
            except Exception as exc:
                log.warning("[classes] pptx text extraction failed document_id=%s err=%s", document_id, exc)
                pages = []
            pdf_path = converted_pdf_path(document_id)
            conversion_error = conversion_error_db
            pdf_ready = pdf_path.exists() and pdf_path.stat().st_size > 0
            viewer_status = str(viewer_status_db or "").lower()
            viewer_file_url = viewer_file_url_db
            if pdf_ready and (viewer_status != "ready" or viewer_file_url != viewer_url(class_id, document_id)):
                synced = await sync_existing_office_preview(document_id, class_id)
                viewer_status = str(synced.get("viewer_status") or "ready")
                viewer_file_url = synced.get("viewer_file_url")
                conversion_error = None
            elif not pdf_ready and indexed_at is not None:
                source_path = _original_file_path_for_logs(
                    storage_key,
                    storage_url,
                    storage_backend,
                    class_id=class_id,
                    document_id=document_id,
                    filename=filename,
                    context="preview_generate",
                )
                result = await generate_office_preview(
                    document_id=document_id,
                    class_id=class_id,
                    data=data,
                    kind="pptx",
                    original_file_path=source_path,
                )
                pdf_ready = bool(result.get("preview_ready"))
                viewer_status = str(result.get("viewer_status") or ("ready" if pdf_ready else "failed"))
                viewer_file_url = result.get("viewer_file_url")
                conversion_error = result.get("conversion_error")
                log.info("[OFFICE_PREVIEW] generated viewer_file_url=%s document_id=%s", viewer_file_url, document_id)
            else:
                viewer_status = viewer_status or "processing"
            return {
                "document_id": document_id,
                "file_type": "pptx",
                "status": "preview_ready" if pdf_ready else ("preview_processing" if viewer_status == "processing" else "preview_unavailable"),
                "type": "pdf" if pdf_ready else "text",
                "kind": "pptx",
                "filename": filename,
                "content_type": mime_type,
                "pages": pages,
                "text_preview": "\n\n".join(pages[:5]) if pages else None,
                "conversion_error": None if pdf_ready else conversion_error,
                "pdf_url": viewer_file_url if pdf_ready else None,
                "viewer_status": viewer_status,
                "viewer_file_url": viewer_file_url,
                "viewer_file_type": "pdf" if pdf_ready else None,
                "preview": {
                    "type": "pdf" if pdf_ready else "text",
                    "status": "ready" if pdf_ready else ("generating" if viewer_status == "processing" else "failed"),
                    "url": viewer_file_url if pdf_ready else None,
                    "error": None
                    if pdf_ready
                    else (conversion_error or ("Preparing slide preview..." if viewer_status == "processing" else "Preview PDF was not generated.")),
                },
                "fallback_text_available": bool(pages),
            }

        if _is_docx(filename, mime_type):
            try:
                pages = _docx_text_pages(data)
            except Exception as exc:
                log.warning("[classes] docx text extraction failed document_id=%s err=%s", document_id, exc)
                pages = []
            pdf_path = converted_pdf_path(document_id)
            conversion_error = conversion_error_db
            pdf_ready = pdf_path.exists() and pdf_path.stat().st_size > 0
            viewer_status = str(viewer_status_db or "").lower()
            viewer_file_url = viewer_file_url_db
            if pdf_ready and (viewer_status != "ready" or viewer_file_url != viewer_url(class_id, document_id)):
                synced = await sync_existing_office_preview(document_id, class_id)
                viewer_status = str(synced.get("viewer_status") or "ready")
                viewer_file_url = synced.get("viewer_file_url")
                conversion_error = None
            elif not pdf_ready and indexed_at is not None:
                source_path = _original_file_path_for_logs(
                    storage_key,
                    storage_url,
                    storage_backend,
                    class_id=class_id,
                    document_id=document_id,
                    filename=filename,
                    context="preview_generate_docx",
                )
                result = await generate_office_preview(
                    document_id=document_id,
                    class_id=class_id,
                    data=data,
                    kind="docx",
                    original_file_path=source_path,
                )
                pdf_ready = bool(result.get("preview_ready"))
                viewer_status = str(result.get("viewer_status") or ("ready" if pdf_ready else "failed"))
                viewer_file_url = result.get("viewer_file_url")
                conversion_error = result.get("conversion_error")
                log.info("[OFFICE_PREVIEW] generated viewer_file_url=%s document_id=%s", viewer_file_url, document_id)
            else:
                viewer_status = viewer_status or "processing"
            return {
                "document_id": document_id,
                "file_type": "docx",
                "status": "preview_ready" if pdf_ready else "preview_unavailable",
                "type": "pdf" if pdf_ready else "text",
                "kind": "docx",
                "filename": filename,
                "content_type": mime_type,
                "pages": pages,
                "text_preview": "\n\n".join(pages[:3]) if pages else None,
                "conversion_error": None if pdf_ready else conversion_error,
                "pdf_url": viewer_file_url if pdf_ready else None,
                "viewer_status": viewer_status,
                "viewer_file_url": viewer_file_url,
                "viewer_file_type": "pdf" if pdf_ready else None,
                "preview": {
                    "type": "pdf" if pdf_ready else "text",
                    "status": "ready" if pdf_ready else ("generating" if viewer_status == "processing" else "failed"),
                    "url": viewer_file_url if pdf_ready else None,
                    "error": None
                    if pdf_ready
                    else (conversion_error or ("Preparing document preview..." if viewer_status == "processing" else "Preview PDF was not generated.")),
                },
                "fallback_text_available": bool(pages),
            }

        if (
            mime_lower.startswith("text/")
            or filename_lower.endswith((".txt", ".md", ".csv", ".json", ".log"))
        ):
            return {
                "type": "text",
                "kind": "text",
                "filename": filename,
                "content_type": mime_type,
                "pages": [_decode_text_preview(data)],
            }
    except HTTPException:
        raise
    except Exception as exc:
        log.warning("Failed to build preview for document %s: %s", document_id, exc)
        raise HTTPException(status_code=422, detail="Could not build a preview for this file")

    raise HTTPException(status_code=415, detail="Preview is not available for this file type")


@router.get("/{class_id}/documents/{document_id}/preview-debug")
async def document_preview_debug(
    class_id: int,
    document_id: str,
    user_uid: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT files.storage_key,
                   files.storage_url,
                   files.mime_type,
                   files.filename,
                   files.storage_backend,
                   files.viewer_file_path,
                   files.viewer_file_url,
                   files.viewer_file_type,
                   files.viewer_status,
                   files.conversion_error,
                   files.preview_key,
                   files.original_file_url,
                   files.original_file_path
            FROM files
            JOIN classes ON classes.id = files.class_id
            WHERE files.id=%s AND files.class_id=%s AND classes.owner_uid=%s
            """,
            (document_id, class_id, user_uid),
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")

    (
        storage_key,
        storage_url,
        mime_type,
        filename,
        storage_backend,
        viewer_file_path_db,
        viewer_file_url_db,
        viewer_file_type,
        viewer_status,
        conversion_error,
        preview_key,
        original_file_url_db,
        original_file_path_db,
    ) = row

    original = _storage_debug_stat(
        storage_key,
        storage_url,
        storage_backend,
        class_id=class_id,
        document_id=document_id,
        filename=filename,
    )
    pdf_path = converted_pdf_path(document_id)
    viewer_file_path = str(viewer_file_path_db or pdf_path)
    viewer_exists = pdf_path.exists() and pdf_path.stat().st_size > 0
    viewer_size = pdf_path.stat().st_size if viewer_exists else 0
    viewer_file_url = viewer_file_url_db or (viewer_url(class_id, document_id) if viewer_exists else None)

    log.info("[PPTX_PREVIEW] document_id = %s", document_id)
    log.info("[PPTX_PREVIEW] original_file_path = %s", original.get("original_file_path"))
    log.info("[PPTX_PREVIEW] original_exists = %s", original.get("original_file_exists"))
    log.info("[PPTX_PREVIEW] original_size = %s", original.get("original_file_size"))
    log.info("[PPTX_PREVIEW] expected_pdf_path = %s", viewer_file_path)
    log.info("[PPTX_PREVIEW] pdf_exists = %s", viewer_exists)
    log.info("[PPTX_PREVIEW] pdf_size = %s", viewer_size)
    log.info("[PPTX_PREVIEW] viewer_file_url = %s", viewer_file_url)
    log.info("[PPTX_PREVIEW] viewer_status = %s", viewer_status or ("ready" if viewer_exists else "missing"))
    log.info("[PPTX_PREVIEW] conversion_error = %s", conversion_error or "")

    return {
        "document_id": document_id,
        "filename": filename,
        "mime_type": mime_type,
        "storage_backend": storage_backend,
        "original_file_path": original.get("original_file_path") or original_file_path_db,
        "original_file_url": original_file_url_db or storage_url,
        "original_file_exists": original.get("original_file_exists"),
        "original_file_size": original.get("original_file_size"),
        "viewer_file_path": viewer_file_path,
        "viewer_file_exists": viewer_exists,
        "viewer_file_size": viewer_size,
        "viewer_file_url": viewer_file_url,
        "viewer_file_type": viewer_file_type or ("pdf" if viewer_exists else None),
        "viewer_status": viewer_status or ("ready" if viewer_exists else "missing"),
        "conversion_error": conversion_error,
        "preview_key": preview_key,
        "can_access_viewer_url": bool(viewer_file_url and viewer_exists),
        "viewer_url_http_status_if_testable": 200 if viewer_file_url and viewer_exists else None,
        "content_type": "application/pdf" if viewer_exists else None,
    }


@router.get("/{class_id}/documents/{document_id}/preview.pdf")
async def get_document_preview_pdf(
    class_id: int,
    document_id: str,
    user_uid: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT files.filename, files.mime_type, files.storage_key, files.storage_url, files.storage_backend
            FROM files
            JOIN classes ON classes.id = files.class_id
            WHERE files.id=%s AND files.class_id=%s AND classes.owner_uid=%s
            """,
            (document_id, class_id, user_uid),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="File not found")
        filename, mime_type, storage_key, storage_url, storage_backend = row
        if not (_is_pptx(filename, mime_type) or _is_docx(filename, mime_type)):
            raise HTTPException(
                status_code=415,
                detail="This preview PDF endpoint is only used for converted PowerPoint or Word documents.",
            )

    preview_root_dir = _preview_dir(document_id).resolve()
    path = converted_pdf_path(document_id).resolve()
    try:
        path.relative_to(preview_root_dir)
    except ValueError:
        log.warning("[classes] preview.pdf path outside preview dir document_id=%s path=%s", document_id, path)
        raise HTTPException(status_code=404, detail="Preview file is not ready")

    if not path.exists() or path.stat().st_size == 0:
        log.info(
            "[classes] preview.pdf missing or empty; regenerating class_id=%s document_id=%s",
            class_id,
            document_id,
        )
        original_bytes = await _document_bytes_async(
            storage_key,
            storage_url,
            storage_backend,
            document_id=document_id,
            class_id=class_id,
            display_filename=filename,
            context="preview_pdf_regen",
        )
        if _is_pptx(filename, mime_type):
            result = await generate_office_preview(
                document_id=document_id,
                class_id=class_id,
                data=original_bytes,
                kind="pptx",
                original_file_path=_original_file_path_for_logs(
                    storage_key,
                    storage_url,
                    storage_backend,
                    class_id=class_id,
                    document_id=document_id,
                    filename=filename,
                    context="preview_pdf_regen",
                ),
            )
        else:
            result = await generate_office_preview(
                document_id=document_id,
                class_id=class_id,
                data=original_bytes,
                kind="docx",
                original_file_path=_original_file_path_for_logs(
                    storage_key,
                    storage_url,
                    storage_backend,
                    class_id=class_id,
                    document_id=document_id,
                    filename=filename,
                    context="preview_pdf_regen",
                ),
            )
        path = converted_pdf_path(document_id).resolve()
        conv_err = result.get("conversion_error")
        if conv_err:
            log.warning(
                "[classes] preview.pdf regeneration failed document_id=%s err=%s",
                document_id,
                conv_err[:500],
            )
        if not path.exists() or path.stat().st_size == 0:
            raise HTTPException(status_code=404, detail="Preview file is not ready")

    return FileResponse(path, media_type="application/pdf", filename=f"{Path(str(filename)).stem}.pdf")


@router.post("/{class_id}/documents/{document_id}/process-preview")
@router.post("/{class_id}/documents/{document_id}/retry-preview")
async def process_document_preview(
    class_id: int,
    document_id: str,
    user_uid: str = Depends(get_request_user_uid),
):
    """Re-run LibreOffice conversion for PPTX/DOCX and refresh viewer artifact fields."""
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT files.filename, files.mime_type, files.storage_key, files.storage_url, files.storage_backend
            FROM files
            JOIN classes ON classes.id = files.class_id
            WHERE files.id=%s AND files.class_id=%s AND classes.owner_uid=%s
            """,
            (document_id, class_id, user_uid),
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    filename, mime_type, storage_key, storage_url, storage_backend = row
    if not (_is_pptx(filename, mime_type) or _is_docx(filename, mime_type)):
        raise HTTPException(
            status_code=415,
            detail="Preview regeneration applies to PowerPoint (.pptx) and Word (.docx) uploads only.",
        )

    log.info(
        "[classes] process_preview_start class_id=%s document_id=%s filename=%r",
        class_id,
        document_id,
        filename,
    )
    data = await _document_bytes_async(
        storage_key,
        storage_url,
        storage_backend,
        document_id=document_id,
        class_id=class_id,
        display_filename=filename,
        context="process_preview",
    )
    result = await generate_office_preview(
        document_id=document_id,
        class_id=class_id,
        data=data,
        kind="pptx" if _is_pptx(filename, mime_type) else "docx",
        original_file_path=_original_file_path_for_logs(
            storage_key,
            storage_url,
            storage_backend,
            class_id=class_id,
            document_id=document_id,
            filename=filename,
            context="process_preview",
        ),
    )
    pdf_ready = bool(result.get("preview_ready"))

    log.info(
        "[classes] process_preview_done document_id=%s viewer_status=%s pdf_ready=%s err_set=%s",
        document_id,
        result.get("viewer_status"),
        pdf_ready,
        bool(result.get("conversion_error") and not pdf_ready),
    )
    return {
        "document_id": document_id,
        "preview_ready": pdf_ready,
        "preview_error": result.get("conversion_error"),
        "conversion_error": result.get("conversion_error"),
        "viewer_status": result.get("viewer_status"),
        "viewer_file_url": result.get("viewer_file_url"),
        "pdf_url": result.get("viewer_file_url"),
    }


@router.get("/{class_id}/documents/{document_id}/preview-assets/{asset_name}")
async def get_preview_asset(
    class_id: int,
    document_id: str,
    asset_name: str,
    user_uid: str = Depends(get_request_user_uid),
):
    if "/" in asset_name or "\\" in asset_name or asset_name.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid asset name")
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT 1
            FROM files
            JOIN classes ON classes.id = files.class_id
            WHERE files.id=%s AND files.class_id=%s AND classes.owner_uid=%s
            """,
            (document_id, class_id, user_uid),
        )
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="File not found")

    path = (_preview_dir(document_id) / asset_name).resolve()
    if not str(path).startswith(str(_preview_dir(document_id))) or not path.exists():
        raise HTTPException(status_code=404, detail="Preview asset not found")
    media_type = "application/pdf" if path.suffix.lower() == ".pdf" else "image/png"
    return FileResponse(path, media_type=media_type)


@router.get("/{class_id}/documents/{document_id}/content")
async def get_document_content(
    class_id: int,
    document_id: str,
    user_uid: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT files.id::text, files.filename, files.mime_type
            FROM files
            JOIN classes ON classes.id = files.class_id
            WHERE files.id=%s AND files.class_id=%s AND classes.owner_uid=%s
            """,
            (document_id, class_id, user_uid),
        )
        file_row = await cur.fetchone()
        if not file_row:
            raise HTTPException(status_code=404, detail="File not found")
        await cur.execute(
            """
            SELECT idx, content, page_start, page_end
            FROM file_chunks
            WHERE file_id=%s
            ORDER BY idx
            """,
            (document_id,),
        )
        rows = await cur.fetchall()
    return {
        "document_id": file_row[0],
        "filename": file_row[1],
        "mime_type": file_row[2],
        "chunks": [
            {
                "idx": row[0],
                "text": row[1],
                "page_or_slide": row[2],
                "page_start": row[2],
                "page_end": row[3],
            }
            for row in rows
        ],
    }

