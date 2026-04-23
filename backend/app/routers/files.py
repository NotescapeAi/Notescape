import uuid
import shutil
import logging
import json
import asyncio
from typing import BinaryIO
from uuid import UUID
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from app.core.db import db_conn
from pathlib import Path, PurePosixPath
from app.core.settings import settings
from fastapi.responses import FileResponse
from app.core.storage import (
    presign_get_url,
    put_object,
    delete_prefix,
    sanitize_filename,
    build_s3_key_original,
    build_s3_document_prefix,
    put_bytes,
)

UPLOAD_ROOT = Path(settings.upload_root)
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

router = APIRouter(prefix="/api/files", tags=["files"])
log = logging.getLogger("uvicorn.error")


class FileRename(BaseModel):
    filename: str


def _copy_upload_to_path(src_file: BinaryIO, dest_path: Path) -> int:
    src_file.seek(0)
    with open(dest_path, "wb") as out:
        shutil.copyfileobj(src_file, out)
    return dest_path.stat().st_size


def _upload_local_file_to_s3(local_path: Path, key: str, content_type: str | None):
    with open(local_path, "rb") as src:
        return put_object(src, key=key, content_type=content_type)


async def _set_file_storage_key(file_id: str, storage_key: str):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "UPDATE files SET storage_key=%s WHERE id=%s",
            (storage_key, file_id),
        )
        await conn.commit()


async def _finalize_s3_upload_async(
    file_id: str,
    class_id: int,
    owner_uid: str,
    original_name: str,
    safe_name: str,
    size_bytes: int,
    content_type: str | None,
    local_path: Path,
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

        if safe_name.lower().endswith((".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp")):
            await _update_file_status(file_id, "PROCESSING")
            if safe_name.lower().endswith(".pdf"):
                await _process_pdf_async(
                    file_id=file_id,
                    safe_name=safe_name,
                    local_path=local_path,
                    class_id=class_id,
                    owner_uid=owner_uid,
                    storage_backend="s3",
                    storage_key=storage_key,
                )
            else:
                output_prefix = build_s3_document_prefix("public", owner_uid, class_id, file_id)
                queued = await _queue_ocr_job(file_id, output_prefix)
                await _update_file_status(file_id, "OCR_QUEUED", ocr_job_id=queued["job_id"])
                try:
                    if local_path.exists():
                        local_path.unlink()
                except Exception:
                    pass
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
                COUNT(file_chunks.id)::int AS chunk_count
            FROM files
            LEFT JOIN file_chunks ON file_chunks.file_id = files.id
            WHERE files.class_id=%s
            GROUP BY files.id
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
            items.append(item)
        return items


async def _update_file_status(file_id: str, status: str, error: str | None = None, ocr_job_id: str | None = None, indexed: bool = False):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE files
            SET status=%s,
                last_error=%s,
                ocr_job_id=COALESCE(%s, ocr_job_id),
                indexed_at=CASE WHEN %s THEN now() ELSE indexed_at END
            WHERE id=%s
            """,
            (status, error, ocr_job_id, indexed, file_id),
        )
        await conn.commit()


async def _queue_ocr_job(file_id: str, output_prefix: str, engine: str = "hybrid"):
    job_id = str(uuid.uuid4())
    output_json_key = f"{output_prefix}/ocr/normalized.json"
    output_text_key = f"{output_prefix}/ocr/markdown.md"
    async with db_conn() as (conn, cur):
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
    }

async def _process_pdf_async(
    file_id: str,
    safe_name: str,
    local_path: Path,
    class_id: int,
    owner_uid: str,
    storage_backend: str,
    storage_key: str | None,
):
    status = "UPLOADED"
    ocr_job_id = None
    try:
        output_prefix = build_s3_document_prefix("public", owner_uid, class_id, file_id)
        queued = await _queue_ocr_job(file_id, output_prefix)
        ocr_job_id = queued["job_id"]
        status = "OCR_QUEUED"
        await _update_file_status(file_id, status, ocr_job_id=ocr_job_id)
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
    # 1) ensure class exists
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT owner_uid FROM classes WHERE id=%s", (class_id,))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Class not found")
        owner_uid = row[0]

    original_name = file.filename or "upload.bin"
    safe_name = sanitize_filename(original_name)
    file_id = str(uuid.uuid4())

    # 2) local disk path + S3 key
    rel_path = PurePosixPath(f"class_{class_id}/{file_id}/{safe_name}")
    local_path = (UPLOAD_ROOT / Path(rel_path.as_posix())).resolve()
    local_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        size_bytes = await run_in_threadpool(_copy_upload_to_path, file.file, local_path)
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
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            INSERT INTO files (id, class_id, filename, mime_type, storage_url, storage_key, size_bytes, status, storage_backend)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (file_id, class_id, original_name, file.content_type, storage_url, storage_key, size_bytes, initial_status, storage_backend)
        )
        await conn.commit()

    # 4) async post-upload processing
    status = initial_status
    ocr_job_id = None
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
            )
        )
    elif safe_name.lower().endswith((".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp")):
        status = "PROCESSING"
        await _update_file_status(file_id, status)
        if safe_name.lower().endswith(".pdf"):
            asyncio.create_task(
                _process_pdf_async(
                    file_id=file_id,
                    safe_name=safe_name,
                    local_path=local_path,
                    class_id=class_id,
                    owner_uid=owner_uid,
                    storage_backend=storage_backend,
                    storage_key=storage_key,
                )
            )
        else:
            output_prefix = build_s3_document_prefix("public", owner_uid, class_id, file_id)
            queued = await _queue_ocr_job(file_id, output_prefix)
            ocr_job_id = queued["job_id"]
            status = "OCR_QUEUED"
            await _update_file_status(file_id, status, ocr_job_id=ocr_job_id)

    return {
        "id": file_id,
        "class_id": class_id,
        "filename": original_name,
        "mime_type": file.content_type,
        "storage_key": storage_key,
        "storage_url": storage_url,
        "status": status,
        "ocr_job_id": ocr_job_id,
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

    job_id = str(uuid.uuid4())

    # processed layer output keys
    output_prefix = build_s3_document_prefix("public", owner_uid, class_id, str(file_id))
    output_json_key = f"{output_prefix}/ocr/normalized.json"
    output_text_key = f"{output_prefix}/ocr/markdown.md"

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            INSERT INTO ocr_jobs (id, file_id, status, engine, output_json_key, output_text_key)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (job_id, str(file_id), "queued", engine, output_json_key, output_text_key)
        )
        await cur.execute(
            "UPDATE files SET status=%s, ocr_job_id=%s WHERE id=%s",
            ("OCR_QUEUED", job_id, str(file_id)),
        )
        await conn.commit()

    return {
        "job_id": job_id,
        "file_id": str(file_id),
        "status": "queued",
        "engine": engine,
        "output_json_key": output_json_key,
        "output_text_key": output_text_key
    }
@router.get("/{file_id}/ocr")
async def get_ocr_jobs(file_id: UUID):
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
