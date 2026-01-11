import uuid
import shutil
import logging
import json
from uuid import UUID
from fastapi import APIRouter, UploadFile, File, HTTPException
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
from app.core.cache import cache_set
from app.lib.pdf_text import detect_digital_pdf
from app.lib.chunking import extract_page_texts
from app.lib.indexing import index_file

UPLOAD_ROOT = Path(settings.upload_root)
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

router = APIRouter(prefix="/api/files", tags=["files"])
log = logging.getLogger("uvicorn.error")


class FileRename(BaseModel):
    filename: str


@router.get("/{class_id:int}")  
async def list_files(class_id: int):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT id, class_id, filename, mime_type, storage_url, size_bytes, uploaded_at, status, ocr_job_id, indexed_at "
            "FROM files WHERE class_id=%s ORDER BY uploaded_at DESC",
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


async def _queue_ocr_job(file_id: str, output_prefix: str, engine: str = "tesseract"):
    job_id = str(uuid.uuid4())
    output_json_key = f"{output_prefix}/text/ocr.json"
    output_text_key = f"{output_prefix}/text/ocr.txt"
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
    upload_id = str(uuid.uuid4())

    # 2) local disk path + S3 key
    rel_path = PurePosixPath(f"class_{class_id}/{file_id}/{safe_name}")
    local_path = (UPLOAD_ROOT / Path(rel_path.as_posix())).resolve()
    local_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        file.file.seek(0)
        with open(local_path, "wb") as out:
            shutil.copyfileobj(file.file, out)
        size_bytes = local_path.stat().st_size
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

    if storage_backend == "s3":
        key = build_s3_key_original(
            "public",
            owner_uid,
            class_id,
            file_id,
            upload_id,
            safe_name,
        )
        try:
            stored = put_object(file.file, key=key, content_type=file.content_type)
            storage_key = stored.key
            metadata_key = f"{build_s3_document_prefix('public', owner_uid, class_id, file_id)}/metadata.json"
            metadata_payload = {
                "document_id": file_id,
                "class_id": class_id,
                "user_id": owner_uid,
                "original_filename": original_name,
                "safe_filename": safe_name,
                "size_bytes": size_bytes,
                "mime_type": file.content_type,
                "storage_key": storage_key,
            }
            put_bytes(metadata_key, json.dumps(metadata_payload).encode("utf-8"), "application/json")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Storage upload failed: {e}")
    elif storage_backend == "local":
        storage_key = rel_path.as_posix()
    else:
        raise HTTPException(status_code=500, detail="Unsupported storage backend")

    # 3) insert DB row
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            INSERT INTO files (id, class_id, filename, mime_type, storage_url, storage_key, size_bytes, status, storage_backend)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (file_id, class_id, original_name, file.content_type, storage_url, storage_key, size_bytes, "UPLOADED", storage_backend)
        )
        await conn.commit()

    # 4) conditional OCR + indexing (PDF only)
    status = "UPLOADED"
    ocr_job_id = None
    try:
        if safe_name.lower().endswith(".pdf"):
            is_digital, sample_text = detect_digital_pdf(str(local_path), max_pages=3, min_chars=200)
            if is_digital:
                page_texts = extract_page_texts(str(local_path))
                full_text = "\n".join(page_texts)
                cache_key = f"filetext:{file_id}:{storage_key or size_bytes}"
                cache_set(cache_key, full_text.encode("utf-8"), ttl_seconds=86400)
                total = await index_file(file_id, page_texts=page_texts)
                status = "INDEXED" if total > 0 else "FAILED"
                await _update_file_status(file_id, status, error=None, indexed=total > 0)
            else:
                output_prefix = build_s3_document_prefix("public", owner_uid, class_id, file_id)
                queued = await _queue_ocr_job(file_id, output_prefix)
                ocr_job_id = queued["job_id"]
                status = "OCR_QUEUED"
                await _update_file_status(file_id, status, ocr_job_id=ocr_job_id)
        else:
            await _update_file_status(file_id, status)
    except Exception as e:
        log.error(f"[files] processing failed for {file_id}: {e}")
        await _update_file_status(file_id, "FAILED", error=str(e))
        status = "FAILED"

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
async def queue_ocr(file_id: UUID, engine: str = "easyocr"):
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
    output_json_key = f"{output_prefix}/text/ocr.json"
    output_text_key = f"{output_prefix}/text/ocr.txt"

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
            SELECT id, status, engine, method, output_text_key, output_json_key, error, created_at, started_at, finished_at
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
        })
    return jobs
