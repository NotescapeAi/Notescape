# app/routers/files.py
import os
import shutil
import uuid
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from pydantic import BaseModel
from app.core.db import db_conn

router = APIRouter(prefix="/api", tags=["files"])

class FileOut(BaseModel):
    id: str
    class_id: int
    filename: str
    mime_type: Optional[str]
    storage_url: str
    size_bytes: Optional[int]

@router.get("/files/{class_id:int}", response_model=List[FileOut])
async def list_files(class_id: int):
    async with db_conn() as (conn, cur):
        await cur.execute("""
            SELECT id::text, class_id, filename, mime_type, storage_url, size_bytes
            FROM files WHERE class_id=%s ORDER BY uploaded_at DESC
        """, (class_id,))
        rows = await cur.fetchall()
    return [
        {
            "id": r[0], "class_id": r[1], "filename": r[2],
            "mime_type": r[3], "storage_url": r[4], "size_bytes": r[5],
        } for r in rows
    ]

@router.post("/files/{class_id:int}", response_model=FileOut, status_code=201)
async def upload_file(class_id: int, request: Request, file: UploadFile = File(...)):
    uploads_root: Path = request.app.state.uploads_root
    uploads_root.mkdir(parents=True, exist_ok=True)

    fid = uuid.uuid4()
    dest = uploads_root / f"{fid}_{file.filename}"
    size = 0
    with dest.open("wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            f.write(chunk)

    async with db_conn() as (conn, cur):
        await cur.execute("""
            INSERT INTO files (id, class_id, filename, mime_type, storage_url, size_bytes)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (str(fid), class_id, file.filename, file.content_type, str(dest), size))
        await conn.commit()

    return {
        "id": str(fid),
        "class_id": class_id,
        "filename": file.filename,
        "mime_type": file.content_type,
        "storage_url": str(dest),
        "size_bytes": size,
    }

@router.delete("/files/{file_id:uuid}", status_code=204)
async def delete_file(file_id: uuid.UUID):
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT storage_url FROM files WHERE id=%s", (str(file_id),))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="file not found")
        path = Path(row[0])
        if path.exists():
            try:
                path.unlink()
            except Exception:
                pass
        await cur.execute("DELETE FROM files WHERE id=%s", (str(file_id),))
        await conn.commit()
    return

@router.get("/files/{file_id}/chunks")
async def list_chunks(file_id: str):
    async with db_conn() as (conn, cur):
        await cur.execute("""
            SELECT id, idx, token_count FROM chunks
            WHERE file_id=%s ORDER BY idx
        """, (file_id,))
        rows = await cur.fetchall()
    return [{"id": r[0], "idx": r[1], "token_count": r[2]} for r in rows]
