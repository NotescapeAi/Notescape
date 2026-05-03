import uuid
import shutil
import logging
import json
import asyncio
import time
import hashlib
from typing import BinaryIO
from uuid import UUID
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from app.core.db import db_conn
from pathlib import Path, PurePosixPath
from app.core.settings import settings
from fastapi.responses import FileResponse
from app.dependencies import get_request_user_uid
from app.lib.indexing import index_file
from app.services.ocr.providers import ocr_provider_status
from app.services.document_preview_state import generate_office_preview, sync_existing_office_preview, viewer_url
from app.services.pptx_preview import converted_pdf_path
from app.core.storage import (
    presign_get_url,
    put_object,
    delete_prefix,
    sanitize_filename,
    build_s3_key_original,
    build_s3_document_prefix,
    put_bytes,
)
from app.lib.stored_document_paths import stored_disk_basename

UPLOAD_ROOT = Path(settings.upload_root)
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

router = APIRouter(prefix="/api/files", tags=["files"])
log = logging.getLogger("uvicorn.error")

PROCESSABLE_EXTENSIONS = (".pdf", ".docx", ".pptx", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp")


def _infer_document_type_and_preview(safe_name: str, mime_type: str | None) -> tuple[str, str | None]:
    """``(document_type, preview_type)`` — ``preview_type`` may be NULL until conversion for Office files."""
    name = (safe_name or "").lower()
    mt = (mime_type or "").lower().split(";")[0].strip()
    if name.endswith(".pdf") or mt == "application/pdf":
        return "pdf", "pdf"
    if name.endswith(".pptx") or "presentationml.presentation" in mt:
        return "pptx", None
    if name.endswith(".docx") or "wordprocessingml.document" in mt:
        return "docx", None
    if mt.startswith("image/") or name.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff")):
        return "image", "image"
    if mt.startswith("text/") or name.endswith((".txt", ".md", ".csv", ".json", ".log")):
        return "text", "text"
    return "unknown", None


class FileRename(BaseModel):
    filename: str


class OCRCleanedPage(BaseModel):
    page_number: int
    cleaned_text: str


class OCRCleanedTextPatch(BaseModel):
    pages: list[OCRCleanedPage]


class OCRFlashcardGenerateReq(BaseModel):
    n_cards: int | None = None
    style: str = "mixed"
    difficulty: str | None = None


class OCRQuizGenerateReq(BaseModel):
    n_questions: int = 10
    mcq_count: int | None = None
    types: list[str] = ["mcq", "conceptual"]
    difficulty: str = "medium"


def _copy_upload_to_path(src_file: BinaryIO, dest_path: Path) -> tuple[int, str]:
    src_file.seek(0)
    digest = hashlib.sha256()
    total = 0
    with open(dest_path, "wb") as out:
        while True:
            chunk = src_file.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            total += len(chunk)
            out.write(chunk)
    return total, digest.hexdigest()


def _upload_local_file_to_s3(local_path: Path, key: str, content_type: str | None):
    with open(local_path, "rb") as src:
        return put_object(src, key=key, content_type=content_type)


async def _set_file_storage_key(file_id: str, storage_key: str):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "UPDATE files SET storage_key=%s, original_file_path=COALESCE(original_file_path, %s) WHERE id=%s",
            (storage_key, storage_key, file_id),
        )
        await conn.commit()


def _is_processable_document(filename: str) -> bool:
    return filename.lower().endswith(PROCESSABLE_EXTENSIONS)


def _is_old_ppt(filename: str, content_type: str | None) -> bool:
    return filename.lower().endswith(".ppt") or str(content_type or "").lower() == "application/vnd.ms-powerpoint"


def _office_kind(filename: str, content_type: str | None) -> str | None:
    name = filename.lower()
    mt = str(content_type or "").lower().split(";")[0].strip()
    if name.endswith(".pptx") or "presentationml.presentation" in mt:
        return "pptx"
    if name.endswith(".docx") or "wordprocessingml.document" in mt:
        return "docx"
    return None


def _is_pdf_document(filename: str | None, mime_type: str | None, document_type: str | None = None) -> bool:
    mt = str(mime_type or "").lower().split(";")[0].strip()
    return (
        str(document_type or "").lower() == "pdf"
        or mt == "application/pdf"
        or str(filename or "").lower().endswith(".pdf")
    )


async def _finalize_s3_upload_async(
    file_id: str,
    class_id: int,
    owner_uid: str,
    original_name: str,
    safe_name: str,
    size_bytes: int,
    content_type: str | None,
    local_path: Path,
    skip_processing: bool = False,
    skip_status: str = "INDEXED",
):
    try:
        upload_id = str(uuid.uuid4())
        key = build_s3_key_original(
            "public",
            owner_uid,
            class_id,
            file_id,
            upload_id,
            safe_name,
        )
        stored = await run_in_threadpool(_upload_local_file_to_s3, local_path, key, content_type)
        storage_key = stored.key

        metadata_key = f"{build_s3_document_prefix('public', owner_uid, class_id, file_id)}/metadata.json"
        metadata_payload = {
            "document_id": file_id,
            "class_id": class_id,
            "user_id": owner_uid,
            "original_filename": original_name,
            "safe_filename": safe_name,
            "size_bytes": size_bytes,
            "mime_type": content_type,
            "storage_key": storage_key,
        }
        await run_in_threadpool(
            put_bytes,
            metadata_key,
            json.dumps(metadata_payload).encode("utf-8"),
            "application/json",
        )
        await _set_file_storage_key(file_id, storage_key)

        if skip_processing:
            await _update_file_status(file_id, skip_status, indexed=skip_status.upper() in {"INDEXED", "READY", "OCR_READY"})
            office_kind = _office_kind(safe_name, content_type)
            if office_kind:
                await generate_office_preview(
                    document_id=file_id,
                    class_id=class_id,
                    data=local_path.read_bytes(),
                    kind=office_kind,  # type: ignore[arg-type]
                    original_file_path=str(local_path),
                )
            try:
                if local_path.exists():
                    local_path.unlink()
            except Exception:
                pass
        elif _is_processable_document(safe_name):
            await _update_file_status(file_id, "PROCESSING")
            await _process_document_async(
                file_id=file_id,
                safe_name=safe_name,
                local_path=local_path,
                class_id=class_id,
                owner_uid=owner_uid,
                storage_backend="s3",
                storage_key=storage_key,
            )
        else:
            await _update_file_status(file_id, "UPLOADED")
            try:
                if local_path.exists():
                    local_path.unlink()
            except Exception:
                pass
    except Exception as e:
        log.error(f"[files] s3 upload failed for {file_id}: {e}")
        await _update_file_status(file_id, "FAILED", error=str(e))


@router.get("/{class_id:int}")  
async def list_files(class_id: int):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT
                files.id,
                files.class_id,
                files.filename,
                files.mime_type,
                files.storage_url,
                files.size_bytes,
                files.uploaded_at,
                files.status,
                files.ocr_job_id,
                files.indexed_at,
                files.last_error,
                files.processing_progress,
                files.source_type,
                files.ocr_provider,
                files.ocr_confidence,
                files.ocr_reviewed_at,
                files.document_type,
                files.preview_type,
                files.preview_error,
                files.viewer_file_url,
                files.viewer_file_path,
                files.viewer_file_type,
                files.viewer_status,
                files.conversion_error,
                files.original_file_url,
                files.original_file_path,
                COUNT(file_chunks.id)::int AS chunk_count
            FROM files
            LEFT JOIN file_chunks ON file_chunks.file_id = files.id
            WHERE files.class_id=%s
            GROUP BY files.id, files.class_id, files.filename, files.mime_type, files.storage_url,
                     files.size_bytes, files.uploaded_at, files.status, files.ocr_job_id, files.indexed_at,
                     files.last_error, files.processing_progress, files.source_type, files.ocr_provider,
                     files.ocr_confidence, files.ocr_reviewed_at, files.document_type, files.preview_type,
                     files.preview_error, files.viewer_file_url, files.viewer_file_path,
                     files.viewer_file_type, files.viewer_status, files.conversion_error,
                     files.original_file_url, files.original_file_path
            ORDER BY files.uploaded_at DESC
            """,
            (class_id,)
        )
        rows = await cur.fetchall()
        cols = [d[0] for d in cur.description]
        items = []
        for r in rows:
            item = dict(zip(cols, r))
            file_id = str(item["id"])
            item["storage_url"] = f"/api/classes/{class_id}/documents/{file_id}/download"
            if _is_pdf_document(item.get("filename"), item.get("mime_type"), item.get("document_type")):
                item["viewer_status"] = "ready"
                item["viewer_file_url"] = item.get("original_file_url") or item["storage_url"]
                item["viewer_file_type"] = "pdf"
                item["conversion_error"] = None
            elif _office_kind(str(item.get("filename") or ""), item.get("mime_type")):
                pdf_path = converted_pdf_path(file_id)
                pdf_ready = pdf_path.exists() and pdf_path.stat().st_size > 0
                if pdf_ready and (
                    item.get("viewer_status") != "ready"
                    or item.get("viewer_file_url") != viewer_url(class_id, file_id)
                    or not item.get("viewer_file_path")
                ):
                    synced = await sync_existing_office_preview(file_id, class_id)
                    if synced.get("viewer_status") == "ready":
                        item["viewer_status"] = "ready"
                        item["viewer_file_url"] = synced.get("viewer_file_url")
                        item["viewer_file_type"] = synced.get("viewer_file_type")
                        item["viewer_file_path"] = synced.get("viewer_file_path")
                        item["conversion_error"] = None
                elif item.get("viewer_status") == "ready" and item.get("viewer_file_url") and pdf_ready:
                    item["viewer_file_type"] = item.get("viewer_file_type") or "pdf"
                else:
                    content_status = str(item.get("status") or "").upper()
                    current_status = str(item.get("viewer_status") or "").lower()
                    if current_status == "failed" or item.get("conversion_error"):
                        item["viewer_status"] = "failed"
                    elif content_status in {"INDEXED", "READY", "OCR_DONE", "OCR_READY", "FAILED"}:
                        item["viewer_status"] = "not_ready"
                    else:
                        item["viewer_status"] = "processing"
                    item["viewer_file_url"] = None
                    item["viewer_file_type"] = None
                    item["viewer_file_path"] = None
                log.info(
                    "[OFFICE_PREVIEW] list_files document_id=%s viewer_status=%s viewer_file_url=%s",
                    file_id,
                    item.get("viewer_status"),
                    item.get("viewer_file_url"),
                )
            items.append(item)
        return items


def _progress_for_status(status: str) -> int:
    return {
        "UPLOADING": 5,
        "UPLOADED": 10,
        "PROCESSING": 20,
        "CONVERTING_PREVIEW": 50,
        "PREVIEW_READY": 65,
        "FAILED_PREVIEW": 65,
        "EXTRACTING_TEXT": 35,
        "CHUNKING": 62,
        "OCR_QUEUED": 35,
        "RUNNING_OCR": 45,
        "PREPARING_REVIEW": 70,
        "OCR_NEEDS_REVIEW": 90,
        "OCR_READY": 100,
        "GENERATING_EMBEDDINGS": 75,
        "OCR_DONE": 85,
        "INDEXED": 100,
        "READY": 100,
        "FAILED": 100,
    }.get(status.upper(), 0)


async def _update_file_status(file_id: str, status: str, error: str | None = None, ocr_job_id: str | None = None, indexed: bool = False):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE files
            SET status=%s,
                last_error=%s,
                ocr_job_id=COALESCE(%s, ocr_job_id),
                processing_progress=%s,
                indexed_at=CASE WHEN %s THEN now() ELSE indexed_at END
            WHERE id=%s
            """,
            (status, error, ocr_job_id, _progress_for_status(status), indexed, file_id),
        )
        await conn.commit()


async def _copy_existing_processed_file(new_file_id: str, class_id: int, content_hash: str) -> bool:
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT f.id::text
            FROM files f
            WHERE f.class_id=%s
              AND f.content_hash=%s
              AND f.id::text<>%s
              AND f.indexed_at IS NOT NULL
              AND EXISTS (SELECT 1 FROM file_chunks fc WHERE fc.file_id=f.id)
            ORDER BY f.indexed_at DESC
            LIMIT 1
            """,
            (class_id, content_hash, new_file_id),
        )
        row = await cur.fetchone()
        if not row:
            return False
        source_file_id = row[0]
        await cur.execute("DELETE FROM file_chunks WHERE file_id=%s", (new_file_id,))
        await cur.execute(
            """
            INSERT INTO file_chunks (file_id, idx, content, char_len, page_start, page_end, chunk_vector)
            SELECT %s, idx, content, char_len, page_start, page_end, chunk_vector
            FROM file_chunks
            WHERE file_id=%s
            ORDER BY idx
            """,
            (new_file_id, source_file_id),
        )
        await cur.execute(
            """
            UPDATE files
            SET status='INDEXED',
                processing_progress=100,
                indexed_at=now(),
                last_error=NULL,
                original_file_url=COALESCE(original_file_url, storage_url),
                original_file_path=COALESCE(original_file_path, storage_key)
            WHERE id=%s
            """,
            (new_file_id,),
        )
        await conn.commit()
    log.info(
        "[files] processing cache hit new_file_id=%s source_file_id=%s class_id=%s hash=%s",
        new_file_id,
        source_file_id,
        class_id,
        content_hash[:12],
    )
    return True


async def _queue_ocr_job(file_id: str, output_prefix: str, engine: str = "hybrid"):
    job_id = str(uuid.uuid4())
    output_json_key = f"{output_prefix}/ocr/normalized.json"
    output_text_key = f"{output_prefix}/ocr/markdown.md"
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT id::text, status
            FROM ocr_jobs
            WHERE file_id=%s AND status IN ('queued', 'running')
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (str(file_id),),
        )
        existing = await cur.fetchone()
        if existing:
            return {
                "job_id": existing[0],
                "output_json_key": output_json_key,
                "output_text_key": output_text_key,
                "deduped": True,
            }
        await cur.execute(
            """
            INSERT INTO ocr_jobs (id, file_id, status, engine, output_json_key, output_text_key)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (job_id, str(file_id), "queued", engine, output_json_key, output_text_key),
        )
        await conn.commit()
    return {
        "job_id": job_id,
        "output_json_key": output_json_key,
        "output_text_key": output_text_key,
        "deduped": False,
    }


async def _ensure_owned_file(file_id: str, user_id: str) -> dict:
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT files.id::text,
                   files.class_id,
                   files.filename,
                   files.mime_type,
                   files.storage_key,
                   files.storage_backend,
                   files.source_type,
                   files.ocr_provider,
                   files.ocr_confidence,
                   files.ocr_reviewed_at,
                   classes.owner_uid
            FROM files
            JOIN classes ON classes.id = files.class_id
            WHERE files.id=%s
              AND (%s='dev-user' OR classes.owner_uid=%s)
            """,
            (file_id, user_id, user_id),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        cols = [d[0] for d in cur.description]
        return dict(zip(cols, row))


async def _ensure_owned_class(class_id: int, user_id: str) -> str:
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT owner_uid FROM classes WHERE id=%s AND (%s='dev-user' OR owner_uid=%s)",
            (class_id, user_id, user_id),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Class not found")
        return row[0]


def _is_handwritten_allowed(filename: str, content_type: str | None) -> bool:
    name = filename.lower()
    mime = str(content_type or "").lower()
    return (
        mime == "application/pdf"
        or mime in {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/tiff"}
        or name.endswith((".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"))
    )


async def _index_cleaned_ocr_pages(file_id: str) -> int:
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT page_number, cleaned_text
            FROM handwritten_ocr_pages
            WHERE file_id=%s
            ORDER BY page_number
            """,
            (file_id,),
        )
        rows = await cur.fetchall()
    page_texts = [str(r[1] or "").strip() for r in rows]
    return await index_file(file_id, page_texts=page_texts)


async def _ensure_ocr_reviewed_and_indexed(file_id: str, user_id: str) -> dict:
    info = await _ensure_owned_file(file_id, user_id)
    if info.get("source_type") != "handwritten_ocr":
        raise HTTPException(status_code=400, detail="This document is not a handwritten OCR upload.")
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT COUNT(*)::int,
                   COUNT(*) FILTER (WHERE reviewed)::int,
                   COUNT(*) FILTER (WHERE confidence < 0.45 AND NOT reviewed)::int
            FROM handwritten_ocr_pages
            WHERE file_id=%s
            """,
            (file_id,),
        )
        total, reviewed, low_unreviewed = await cur.fetchone()
        await cur.execute("SELECT COUNT(*)::int FROM file_chunks WHERE file_id=%s", (file_id,))
        chunk_count = (await cur.fetchone())[0]
    if not total:
        raise HTTPException(status_code=409, detail="OCR is not ready yet.")
    if reviewed < total or low_unreviewed:
        raise HTTPException(status_code=409, detail="Review and save OCR text before generating study material.")
    if not chunk_count:
        await _index_cleaned_ocr_pages(file_id)
    return info


async def _get_ocr_pages(file_id: str) -> list[dict]:
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT page_number, raw_text, cleaned_text, confidence, lines, warnings,
                   provider, original_image_key, processed_image_keys, reviewed, updated_at
            FROM handwritten_ocr_pages
            WHERE file_id=%s
            ORDER BY page_number
            """,
            (file_id,),
        )
        rows = await cur.fetchall()
    pages = []
    for r in rows:
        pages.append(
            {
                "page_number": r[0],
                "raw_text": r[1] or "",
                "cleaned_text": r[2] or "",
                "confidence": float(r[3] or 0.0),
                "lines": r[4] or [],
                "warnings": r[5] or [],
                "provider": r[6] or "local",
                "image_url": f"/api/files/{file_id}/ocr/pages/{r[0]}/image" if r[7] else None,
                "processed_image_available": bool(r[8]),
                "reviewed": bool(r[9]),
                "updated_at": r[10].isoformat() if r[10] else None,
            }
        )
    return pages

async def _process_document_async(
    file_id: str,
    safe_name: str,
    local_path: Path,
    class_id: int,
    owner_uid: str,
    storage_backend: str,
    storage_key: str | None,
    engine: str = "hybrid",
):
    started = time.perf_counter()
    try:
        output_prefix = build_s3_document_prefix("public", owner_uid, class_id, file_id)
        queued = await _queue_ocr_job(file_id, output_prefix, engine=engine)
        await _update_file_status(file_id, "OCR_QUEUED", ocr_job_id=queued["job_id"])
        log.info(
            "[files] processing job queued file_id=%s filename=%s job_id=%s deduped=%s elapsed_ms=%d",
            file_id,
            safe_name,
            queued["job_id"],
            queued.get("deduped", False),
            int((time.perf_counter() - started) * 1000),
        )
    except Exception as e:
        log.error(f"[files] processing failed for {file_id}: {e}")
        await _update_file_status(file_id, "FAILED", error=str(e))
    finally:
        if storage_backend.lower() == "s3":
            try:
                if local_path.exists():
                    local_path.unlink()
            except Exception:
                pass


@router.post("/{class_id:int}")
async def upload_file(class_id: int, file: UploadFile = File(...)):
    request_started = time.perf_counter()
    log.info(
        "[files] stage=upload_received class_id=%s filename=%r content_type=%r",
        class_id,
        file.filename,
        file.content_type,
    )
    # 1) ensure class exists
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT owner_uid FROM classes WHERE id=%s", (class_id,))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Class not found")
        owner_uid = row[0]

    original_name = file.filename or "upload.bin"
    safe_name = sanitize_filename(original_name)
    if _is_old_ppt(original_name, file.content_type):
        raise HTTPException(
            status_code=415,
            detail="Old .ppt files are not supported yet. Please upload .pptx or PDF.",
        )
    if safe_name.lower().endswith(".pptx") and file.content_type:
        allowed_pptx_mime = {
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/octet-stream",
            "application/zip",
        }
        ct = str(file.content_type).lower().split(";")[0].strip()
        if ct not in allowed_pptx_mime:
            log.warning(
                "[files] pptx upload unexpected mime class_id=%s filename=%r content_type=%r",
                class_id,
                original_name,
                file.content_type,
            )
            raise HTTPException(
                status_code=415,
                detail="Invalid content type for a PPTX upload. Expected a PowerPoint presentation file.",
            )
    file_id = str(uuid.uuid4())

    # 2) local disk path + S3 key (UUID + extension on disk; original name only in DB filename column)
    stored_name = stored_disk_basename(file_id, safe_name, original_name)
    rel_path = PurePosixPath(f"class_{class_id}/{file_id}/{stored_name}")
    local_path = (UPLOAD_ROOT / Path(rel_path.as_posix())).resolve()
    local_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        save_started = time.perf_counter()
        size_bytes, content_hash = await run_in_threadpool(_copy_upload_to_path, file.file, local_path)
        log.info(
            "[files] stage=file_save file_id=%s display_name=%s stored_rel=%s bytes=%d elapsed_ms=%d",
            file_id,
            original_name,
            rel_path.as_posix(),
            size_bytes,
            int((time.perf_counter() - save_started) * 1000),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")
    finally:
        try:
            file.file.seek(0)
        except Exception:
            pass

    storage_url = f"/api/classes/{class_id}/documents/{file_id}/download"
    storage_key = None
    storage_backend = settings.storage_backend.lower()
    if storage_backend == "local":
        storage_key = rel_path.as_posix()
    elif storage_backend != "s3":
        raise HTTPException(status_code=500, detail="Unsupported storage backend")

    # 3) insert DB row
    initial_status = "UPLOADING" if storage_backend == "s3" else "UPLOADED"
    doc_type, preview_type_init = _infer_document_type_and_preview(safe_name, file.content_type)
    office_kind = _office_kind(safe_name, file.content_type)
    initial_viewer_status = "processing" if office_kind else ("ready" if preview_type_init else None)
    initial_viewer_file_url = storage_url if doc_type == "pdf" else None
    initial_viewer_file_type = "pdf" if doc_type == "pdf" else None
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            INSERT INTO files (
                id, class_id, filename, mime_type, storage_url, storage_key, size_bytes, status,
                storage_backend, content_hash, processing_progress, stored_filename,
                document_type, preview_type, viewer_status, viewer_file_url, viewer_file_type,
                original_file_url, original_file_path
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                file_id,
                class_id,
                original_name,
                file.content_type,
                storage_url,
                storage_key,
                size_bytes,
                initial_status,
                storage_backend,
                content_hash,
                _progress_for_status(initial_status),
                stored_name,
                doc_type,
                preview_type_init,
                initial_viewer_status,
                initial_viewer_file_url,
                initial_viewer_file_type,
                storage_url,
                storage_key,
            )
        )
        await conn.commit()

    log.info(
        "[files] db_insert file_id=%s class_id=%s storage_key=%r stored_filename=%s backend=%s",
        file_id,
        class_id,
        storage_key,
        stored_name,
        storage_backend,
    )

    # 4) async post-upload processing
    status = initial_status
    ocr_job_id = None
    cache_hit = False
    if _is_processable_document(safe_name):
        cache_hit = await _copy_existing_processed_file(file_id, class_id, content_hash)
        if cache_hit:
            status = "INDEXED"

    if storage_backend == "s3":
        asyncio.create_task(
            _finalize_s3_upload_async(
                file_id=file_id,
                class_id=class_id,
                owner_uid=owner_uid,
                original_name=original_name,
                safe_name=safe_name,
                size_bytes=size_bytes,
                content_type=file.content_type,
                local_path=local_path,
                skip_processing=cache_hit,
            )
        )
    elif _is_processable_document(safe_name) and not cache_hit:
        status = "PROCESSING"
        await _update_file_status(file_id, status)
        asyncio.create_task(
            _process_document_async(
                file_id=file_id,
                safe_name=safe_name,
                local_path=local_path,
                class_id=class_id,
                owner_uid=owner_uid,
                storage_backend=storage_backend,
                storage_key=storage_key,
            )
        )

    if storage_backend == "local" and cache_hit and office_kind:
        asyncio.create_task(
            generate_office_preview(
                document_id=file_id,
                class_id=class_id,
                data=local_path.read_bytes(),
                kind=office_kind,  # type: ignore[arg-type]
                original_file_path=str(local_path),
            )
        )

    log.info(
        "[files] upload response ready file_id=%s filename=%s size_bytes=%s status=%s elapsed_ms=%d",
        file_id,
        original_name,
        size_bytes,
        status,
        int((time.perf_counter() - request_started) * 1000),
    )

    return {
        "id": file_id,
        "class_id": class_id,
        "filename": original_name,
        "mime_type": file.content_type,
        "storage_key": storage_key,
        "storage_url": storage_url,
        "status": status,
        "ocr_job_id": ocr_job_id,
        "processing_progress": _progress_for_status(status),
        "size_bytes": size_bytes,
        "uploaded_at": None,
        "last_error": None,
        "viewer_status": initial_viewer_status,
        "viewer_file_url": initial_viewer_file_url,
        "viewer_file_type": initial_viewer_file_type,
        "conversion_error": None,
    }


@router.get("/ocr/provider-status")
async def get_handwritten_ocr_provider_status(user_id: str = Depends(get_request_user_uid)):
    return ocr_provider_status()


@router.post("/{class_id:int}/handwritten")
async def upload_handwritten_file(
    class_id: int,
    file: UploadFile = File(...),
    user_id: str = Depends(get_request_user_uid),
):
    if not settings.ocr_handwritten_enabled:
        raise HTTPException(status_code=503, detail="Handwritten OCR upload is not enabled in this environment.")
    owner_uid = await _ensure_owned_class(class_id, user_id)
    original_name = file.filename or "handwritten-notes"
    safe_name = sanitize_filename(original_name)
    if not _is_handwritten_allowed(original_name, file.content_type):
        raise HTTPException(status_code=415, detail="Handwritten notes must be a PDF, PNG, JPG, JPEG, WEBP, or TIFF file.")

    file_id = str(uuid.uuid4())
    stored_name = stored_disk_basename(file_id, safe_name, original_name)
    rel_path = PurePosixPath(f"class_{class_id}/{file_id}/{stored_name}")
    local_path = (UPLOAD_ROOT / Path(rel_path.as_posix())).resolve()
    local_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        size_bytes, content_hash = await run_in_threadpool(_copy_upload_to_path, file.file, local_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")
    max_bytes = max(1, settings.ocr_max_upload_mb) * 1024 * 1024
    if size_bytes > max_bytes:
        try:
            local_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(status_code=413, detail=f"Handwritten OCR uploads are limited to {settings.ocr_max_upload_mb} MB.")

    storage_url = f"/api/classes/{class_id}/documents/{file_id}/download"
    storage_backend = settings.storage_backend.lower()
    if storage_backend == "local":
        storage_key = rel_path.as_posix()
    elif storage_backend == "s3":
        storage_key = None
    else:
        raise HTTPException(status_code=500, detail="Unsupported storage backend")

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            INSERT INTO files (
                id, class_id, filename, mime_type, storage_url, storage_key, size_bytes,
                status, storage_backend, content_hash, processing_progress, source_type, stored_filename
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'UPLOADED', %s, %s, %s, 'handwritten_ocr', %s)
            """,
            (
                file_id,
                class_id,
                original_name,
                file.content_type,
                storage_url,
                storage_key,
                size_bytes,
                storage_backend,
                content_hash,
                _progress_for_status("UPLOADED"),
                stored_name,
            ),
        )
        await conn.commit()

    if storage_backend == "s3":
        upload_id = str(uuid.uuid4())
        key = build_s3_key_original("public", owner_uid, class_id, file_id, upload_id, safe_name)
        stored = await run_in_threadpool(_upload_local_file_to_s3, local_path, key, file.content_type)
        storage_key = stored.key
        await _set_file_storage_key(file_id, storage_key)
        try:
            local_path.unlink(missing_ok=True)
        except Exception:
            pass
    await _update_file_status(file_id, "OCR_QUEUED")
    output_prefix = build_s3_document_prefix("public", owner_uid, class_id, file_id)
    queued = await _queue_ocr_job(file_id, output_prefix, engine="handwritten")
    async with db_conn() as (conn, cur):
        await cur.execute("UPDATE files SET ocr_job_id=%s WHERE id=%s", (queued["job_id"], file_id))
        await conn.commit()

    return {
        "id": file_id,
        "class_id": class_id,
        "filename": original_name,
        "mime_type": file.content_type,
        "storage_key": storage_key,
        "storage_url": storage_url,
        "status": "OCR_QUEUED",
        "source_type": "handwritten_ocr",
        "ocr_job_id": queued["job_id"],
        "processing_progress": _progress_for_status("OCR_QUEUED"),
        "size_bytes": size_bytes,
        "uploaded_at": None,
        "last_error": None,
    }

@router.delete("/{file_id:uuid}")
async def delete_file(file_id: UUID):
    # fetch storage_key
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT files.storage_key, files.class_id, classes.owner_uid
            FROM files
            JOIN classes ON classes.id = files.class_id
            WHERE files.id=%s
            """,
            (str(file_id),)
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="File not found")
        storage_key = row[0]
        class_id = row[1]
        owner_uid = row[2]

    # delete from MinIO/S3 (best effort)
    try:
        if storage_key and settings.storage_backend.lower() == "s3":
            prefix = build_s3_document_prefix("public", owner_uid, class_id, str(file_id))
            delete_prefix(f"{prefix}/")
    except Exception as e:
        print("WARN: deleting object failed:", e)

    # delete local file (best effort)
    try:
        async with db_conn() as (conn, cur):
            await cur.execute("SELECT storage_key, storage_url FROM files WHERE id=%s", (str(file_id),))
            row = await cur.fetchone()
        if row and row[0]:
            storage_key = str(row[0])
            storage_url = str(row[1] or "")
            rel = None
            if storage_key and not storage_key.startswith("notescape/"):
                rel = PurePosixPath(storage_key)
            elif storage_url.startswith("/uploads/"):
                rel = PurePosixPath(storage_url).relative_to("/uploads")
            elif storage_url.startswith("uploads/"):
                rel = PurePosixPath(storage_url).relative_to("uploads")
            if rel:
                local_path = (UPLOAD_ROOT / Path(rel.as_posix())).resolve()
                if local_path.exists():
                    local_path.unlink()
    except Exception:
        pass

    # delete DB row
    async with db_conn() as (conn, cur):
        await cur.execute("DELETE FROM files WHERE id=%s", (str(file_id),))
        await conn.commit()

    return {"ok": True}


@router.put("/{file_id:uuid}")
async def rename_file(file_id: UUID, payload: FileRename):
    new_name = payload.filename.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Filename is required")
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT id FROM files WHERE id=%s", (str(file_id),))
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="File not found")
        await cur.execute(
            "UPDATE files SET filename=%s WHERE id=%s",
            (new_name, str(file_id)),
        )
        await conn.commit()
    return {"ok": True, "id": str(file_id), "filename": new_name}

@router.get("/{file_id}/download")
async def get_download_url(file_id: UUID):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT storage_key, storage_url, storage_backend, mime_type, filename FROM files WHERE id=%s",
            (str(file_id),)
        )
        row = await cur.fetchone()

    if not row or not row[0]:
        raise HTTPException(status_code=404, detail="File not found")

    storage_key, storage_url, storage_backend, mime_type, filename = row
    if storage_backend and storage_backend.lower() == "s3":
        url = presign_get_url(storage_key, expires_seconds=3600)
        return {"url": url}

    rel = None
    if storage_key and not str(storage_key).startswith("notescape/"):
        rel = PurePosixPath(str(storage_key))
    elif storage_url:
        storage_url = str(storage_url)
        if storage_url.startswith("/uploads/"):
            rel = PurePosixPath(storage_url).relative_to("/uploads")
        elif storage_url.startswith("uploads/"):
            rel = PurePosixPath(storage_url).relative_to("uploads")
    if not rel:
        raise HTTPException(status_code=404, detail="File not found")
    local_path = (UPLOAD_ROOT / Path(rel.as_posix())).resolve()
    if not local_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(local_path, media_type=mime_type, filename=filename)


@router.post("/{file_id}/ocr")
async def queue_ocr(file_id: UUID, engine: str = "hybrid"):
    # confirm file exists
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT files.class_id, classes.owner_uid
            FROM files
            JOIN classes ON classes.id = files.class_id
            WHERE files.id=%s
            """,
            (str(file_id),)
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="File not found")
        class_id, owner_uid = row

    # processed layer output keys
    output_prefix = build_s3_document_prefix("public", owner_uid, class_id, str(file_id))
    queued = await _queue_ocr_job(str(file_id), output_prefix, engine=engine)

    async with db_conn() as (conn, cur):
        await cur.execute(
            "UPDATE files SET status=%s, ocr_job_id=%s WHERE id=%s",
            ("OCR_QUEUED", queued["job_id"], str(file_id)),
        )
        await conn.commit()

    return {
        "job_id": queued["job_id"],
        "file_id": str(file_id),
        "status": "queued",
        "engine": engine,
        "output_json_key": queued["output_json_key"],
        "output_text_key": queued["output_text_key"],
        "deduped": queued.get("deduped", False),
    }
@router.get("/{file_id}/ocr")
async def get_ocr_jobs(file_id: UUID, user_id: str = Depends(get_request_user_uid)):
    info = await _ensure_owned_file(str(file_id), user_id)
    if info.get("source_type") == "handwritten_ocr":
        pages = await _get_ocr_pages(str(file_id))
        reviewed = bool(info.get("ocr_reviewed_at"))
        return {
            "document_id": str(file_id),
            "class_id": info["class_id"],
            "filename": info["filename"],
            "source_type": "handwritten_ocr",
            "provider": pages[0]["provider"] if pages else (info.get("ocr_provider") or "local"),
            "status": "ready" if reviewed else "needs_review",
            "pages": pages,
            "fallback_text_available": bool(pages),
        }
    async with db_conn() as (conn, cur):
        await cur.execute("""
            SELECT id, status, engine, method, output_text_key, output_json_key, error, created_at, started_at, finished_at,
                   raw_json_key, metrics_json_key, correction_log_key
            FROM ocr_jobs
            WHERE file_id=%s
            ORDER BY created_at DESC
        """, (str(file_id),))
        rows = await cur.fetchall()

    jobs = []
    for r in rows:
        jobs.append({
            "id": str(r[0]),
            "status": r[1],
            "engine": r[2],
            "method": r[3],
            "output_text_url": presign_get_url(r[4]) if r[4] else None,
            "output_json_url": presign_get_url(r[5]) if r[5] else None,
            "error": r[6],
            "created_at": r[7],
            "started_at": r[8],
            "finished_at": r[9],
            "raw_json_url": presign_get_url(r[10]) if r[10] else None,
            "metrics_json_url": presign_get_url(r[11]) if r[11] else None,
            "correction_log_url": presign_get_url(r[12]) if r[12] else None,
        })
    return jobs


@router.get("/{file_id}/ocr/pages/{page_number:int}/image")
async def get_ocr_page_image(file_id: UUID, page_number: int, user_id: str = Depends(get_request_user_uid)):
    await _ensure_owned_file(str(file_id), user_id)
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT original_image_key FROM handwritten_ocr_pages WHERE file_id=%s AND page_number=%s",
            (str(file_id), page_number),
        )
        row = await cur.fetchone()
    if not row or not row[0]:
        raise HTTPException(status_code=404, detail="OCR page image not found")
    key = str(row[0])
    if settings.storage_backend.lower() == "s3" or key.startswith("notescape/"):
        data = get_object_bytes(key)
        tmp = UPLOAD_ROOT / "ocr-page-cache" / str(file_id) / f"page-{page_number}.png"
        tmp.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_bytes(data)
        return FileResponse(tmp, media_type="image/png")
    path = (UPLOAD_ROOT / Path(PurePosixPath(key).as_posix())).resolve()
    if not path.exists():
        raise HTTPException(status_code=404, detail="OCR page image not found")
    return FileResponse(path, media_type="image/png")


@router.patch("/{file_id}/ocr/cleaned-text")
async def save_ocr_cleaned_text(
    file_id: UUID,
    payload: OCRCleanedTextPatch,
    user_id: str = Depends(get_request_user_uid),
):
    info = await _ensure_owned_file(str(file_id), user_id)
    if info.get("source_type") != "handwritten_ocr":
        raise HTTPException(status_code=400, detail="This document is not a handwritten OCR upload.")
    if not payload.pages:
        raise HTTPException(status_code=400, detail="At least one OCR page is required.")
    async with db_conn() as (conn, cur):
        for page in payload.pages:
            await cur.execute(
                """
                UPDATE handwritten_ocr_pages
                SET cleaned_text=%s, reviewed=TRUE, updated_at=now()
                WHERE file_id=%s AND page_number=%s AND (%s='dev-user' OR user_id=%s)
                """,
                (page.cleaned_text.strip(), str(file_id), page.page_number, user_id, user_id),
            )
        await cur.execute(
            """
            UPDATE files
            SET status='GENERATING_EMBEDDINGS',
                processing_progress=%s,
                ocr_reviewed_at=now(),
                last_error=NULL
            WHERE id=%s
            """,
            (_progress_for_status("GENERATING_EMBEDDINGS"), str(file_id)),
        )
        await conn.commit()
    chunks = await _index_cleaned_ocr_pages(str(file_id))
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE files
            SET status='OCR_READY',
                processing_progress=100,
                indexed_at=now(),
                last_error=NULL
            WHERE id=%s
            """,
            (str(file_id),),
        )
        await conn.commit()
    return {"ok": True, "document_id": str(file_id), "status": "OCR_READY", "chunks": chunks}


@router.post("/{file_id}/ocr/retry")
async def retry_handwritten_ocr(file_id: UUID, user_id: str = Depends(get_request_user_uid)):
    info = await _ensure_owned_file(str(file_id), user_id)
    output_prefix = build_s3_document_prefix("public", info["owner_uid"], info["class_id"], str(file_id))
    queued = await _queue_ocr_job(str(file_id), output_prefix, engine="handwritten")
    await _update_file_status(str(file_id), "OCR_QUEUED", ocr_job_id=queued["job_id"])
    return {"job_id": queued["job_id"], "file_id": str(file_id), "status": "OCR_QUEUED"}


@router.post("/{file_id}/generate-flashcards-from-ocr")
async def generate_flashcards_from_ocr(
    file_id: UUID,
    payload: OCRFlashcardGenerateReq,
    user_id: str = Depends(get_request_user_uid),
):
    info = await _ensure_ocr_reviewed_and_indexed(str(file_id), user_id)
    job_id = str(uuid.uuid4())
    correlation_id = str(uuid.uuid4())
    job_payload = {
        "class_id": info["class_id"],
        "file_ids": [str(file_id)],
        "sourceDocumentIds": [str(file_id)],
        "source_type": "handwritten_ocr",
        "topic": "Generate study flashcards from reviewed handwritten OCR notes.",
        "style": payload.style,
        "difficulty": payload.difficulty,
        "cardCountMode": "fixed" if payload.n_cards else "auto",
        "requestedCount": payload.n_cards,
        "n_cards": payload.n_cards or 12,
        "top_k": 20,
    }
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            INSERT INTO flashcard_jobs (id, user_id, deck_id, status, progress, payload, correlation_id)
            VALUES (%s, %s, %s, 'queued', 0, %s::jsonb, %s)
            RETURNING id::text, deck_id, status, progress, correlation_id, error_message, created_at, payload
            """,
            (job_id, user_id, info["class_id"], json.dumps(job_payload), correlation_id),
        )
        row = await cur.fetchone()
        await conn.commit()
    return {
        "job_id": row[0],
        "deck_id": row[1],
        "status": row[2],
        "progress": row[3],
        "correlation_id": row[4],
        "error_message": row[5],
        "created_at": row[6].isoformat() if row[6] else None,
        "payload": row[7],
    }


@router.post("/{file_id}/generate-quiz-from-ocr")
async def generate_quiz_from_ocr(
    file_id: UUID,
    payload: OCRQuizGenerateReq,
    user_id: str = Depends(get_request_user_uid),
):
    info = await _ensure_ocr_reviewed_and_indexed(str(file_id), user_id)
    job_id = str(uuid.uuid4())
    mcq_count = payload.mcq_count if payload.mcq_count is not None else payload.n_questions
    requested_theory = max(0, payload.n_questions - int(mcq_count or 0))
    job_payload = {
        "n_questions": payload.n_questions,
        "requested_mcq_count": int(mcq_count or 0),
        "requested_theory_count": requested_theory,
        "mcq_count": mcq_count,
        "types": payload.types,
        "difficulty": payload.difficulty,
        "topic": "Reviewed handwritten OCR notes",
        "source_type": "handwritten_ocr",
    }
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            INSERT INTO quiz_jobs (
                id, user_id, class_id, file_id, status, progress, payload,
                status_message, requested_mcq_count, requested_theory_count
            )
            VALUES (%s, %s, %s, %s, 'queued', 0, %s::jsonb, %s, %s, %s)
            RETURNING id::text, status, progress, status_message, requested_mcq_count, requested_theory_count
            """,
            (
                job_id,
                user_id,
                info["class_id"],
                str(file_id),
                json.dumps(job_payload),
                "Queued from reviewed OCR text",
                int(mcq_count or 0),
                requested_theory,
            ),
        )
        row = await cur.fetchone()
        await conn.commit()
    return {
        "job_id": row[0],
        "status": row[1],
        "progress": row[2],
        "status_message": row[3],
        "requested_mcq_count": row[4],
        "requested_theory_count": row[5],
    }
