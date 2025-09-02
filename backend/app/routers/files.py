import os
import time
from uuid import UUID
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.core.db import db_conn
from pathlib import Path, PurePosixPath
from app.core.settings import settings


UPLOAD_ROOT = Path(os.getenv("UPLOAD_ROOT", Path(__file__).resolve().parents[3] / "uploads"))
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
    # ensure class exists
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT 1 FROM classes WHERE id=%s", (class_id,))
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Class not found")

    # save to disk: uploads/class_<id>/<ts>_<original>
    subdir = UPLOAD_ROOT / f"class_{class_id}"
    subdir.mkdir(parents=True, exist_ok=True)
    ts = int(time.time())
    safe_name = file.filename or "upload.bin"
    disk_path = subdir / f"{ts}_{safe_name}"

    with open(disk_path, "wb") as out:
        while chunk := file.file.read(1024 * 1024):
            out.write(chunk)

    storage_url = f"/uploads/class_{class_id}/{disk_path.name}"

    # record in DB
    file_id = str(uuid.uuid4())
    async with db_conn() as (conn, cur):
        await cur.execute(
            "INSERT INTO files (id, class_id, filename, mime_type, storage_url, size_bytes) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (file_id, class_id, safe_name, file.content_type, storage_url, disk_path.stat().st_size)
        )
        await conn.commit()

    return {
        "id": str(file_id),
        "class_id": class_id,
        "filename": safe_name,
        "mime_type": file.content_type,
        "storage_url": storage_url,
        "size_bytes": disk_path.stat().st_size,
        "uploaded_at": None,  # DB default; fetch again if you need exact
    }



@router.delete("/{file_id:uuid}")   # ⬅ uuid
async def delete_file(file_id: UUID):
    # 1) find file row
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT storage_url FROM files WHERE id=%s", (file_id,))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="File not found")
        storage_url = row[0]

    # 2) delete disk
    uploads_root = Path(settings.upload_root or Path(__file__).resolve().parents[2] / "uploads")
    rel = PurePosixPath(storage_url).relative_to("/uploads")
    abs_path = uploads_root / rel
    try:
        if abs_path.exists():
            abs_path.unlink()
    except Exception as e:
        print("WARN: deleting disk file failed:", e)

    # 3) delete DB (chunks cascade)
    async with db_conn() as (conn, cur):
        await cur.execute("DELETE FROM files WHERE id=%s", (file_id,))
        await conn.commit()

    return {"ok": True}