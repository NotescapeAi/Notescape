import time
from datetime import datetime
import uuid
from uuid import UUID
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.core.db import db_conn
from pathlib import Path, PurePosixPath
from app.core.settings import settings
from app.core.storage import presign_get_url, put_object, delete_object 

UPLOAD_ROOT = Path(
    settings.upload_root or (Path(__file__).resolve().parents[3] / "uploads")
)
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("/{class_id:int}")  
async def list_files(class_id: int):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT id, class_id, filename, mime_type, storage_url, size_bytes, uploaded_at "
            "FROM files WHERE class_id=%s ORDER BY uploaded_at DESC",
            (class_id,)
        )
        rows = await cur.fetchall()
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in rows]


@router.post("/{class_id:int}")
async def upload_file(class_id: int, file: UploadFile = File(...)):
    # 1) ensure class exists
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT 1 FROM classes WHERE id=%s", (class_id,))
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Class not found")

    safe_name = file.filename or "upload.bin"
    file_id = str(uuid.uuid4())

    # 2) object key in MinIO (raw layer)
    key = f"raw/class_{class_id}/{file_id}/{safe_name}"

    stored = put_object(file.file, key=key, content_type=file.content_type)

    # 3) insert DB row
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            INSERT INTO files (id, class_id, filename, mime_type, storage_url, storage_key)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (file_id, class_id, safe_name, file.content_type, stored.s3_url, stored.key)
        )
        await conn.commit()

    return {
        "id": file_id,
        "class_id": class_id,
        "filename": safe_name,
        "mime_type": file.content_type,
        "storage_key": stored.key,
        "storage_url": stored.s3_url,
    }

@router.delete("/{file_id:uuid}")
async def delete_file(file_id: UUID):
    # fetch storage_key
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT storage_key FROM files WHERE id=%s", (str(file_id),))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="File not found")
        storage_key = row[0]

    # delete from MinIO/S3 (best effort)
    try:
        if storage_key:
            delete_object(storage_key)
    except Exception as e:
        print("WARN: deleting object failed:", e)

    # delete DB row
    async with db_conn() as (conn, cur):
        await cur.execute("DELETE FROM files WHERE id=%s", (str(file_id),))
        await conn.commit()

    return {"ok": True}

@router.get("/{file_id}/download")
async def get_download_url(file_id: UUID):
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT storage_key FROM files WHERE id=%s", (str(file_id),))
        row = await cur.fetchone()

    if not row or not row[0]:
        raise HTTPException(status_code=404, detail="File not found")

    key = row[0]
    url = presign_get_url(key, expires_seconds=3600)
    return {"url": url}


@router.post("/{file_id}/ocr")
async def queue_ocr(file_id: UUID, engine: str = "easyocr"):
    # confirm file exists
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT 1 FROM files WHERE id=%s", (str(file_id),))
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="File not found")

    job_id = str(uuid.uuid4())

    # processed layer output keys
    output_json_key = f"processed/ocr/{file_id}/ocr.json"
    output_text_key = f"processed/ocr/{file_id}/ocr.txt"

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            INSERT INTO ocr_jobs (id, file_id, status, engine, output_json_key, output_text_key)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (job_id, str(file_id), "queued", engine, output_json_key, output_text_key)
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
