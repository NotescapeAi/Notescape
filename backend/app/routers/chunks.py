# app/routers/chunks.py
from typing import List, Optional
from dataclasses import dataclass
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from pathlib import Path
from pypdf import PdfReader
from app.core.db import db_conn

router = APIRouter(prefix="/api", tags=["chunks"])

@dataclass
class ChunkSpec:
    chunk_size: int
    chunk_overlap: int

class ChunkReq(BaseModel):
    file_ids: List[str]
    chunk_size: int = Field(default=1200, ge=200, le=4000)
    chunk_overlap: int = Field(default=150, ge=0, le=1000)

def _split_text(txt: str, spec: ChunkSpec) -> List[str]:
    n = spec.chunk_size
    o = spec.chunk_overlap
    out: List[str] = []
    i = 0
    L = len(txt)
    while i < L:
        out.append(txt[i:i+n])
        i += max(1, n - o)
    return out

def _read_pdf(path: Path) -> str:
    reader = PdfReader(str(path))
    parts: List[str] = []
    for p in reader.pages:
        try:
            parts.append(p.extract_text() or "")
        except Exception:
            parts.append("")
    return "\n".join(parts)

@router.post("/chunks")
async def create_chunks(req: ChunkReq):
    results = []
    spec = ChunkSpec(req.chunk_size, req.chunk_overlap)

    for fid in req.file_ids:
        # fetch file path
        async with db_conn() as (conn, cur):
            await cur.execute("SELECT storage_url FROM files WHERE id=%s", (fid,))
            row = await cur.fetchone()
        if not row:
            results.append({"file_id": fid, "total_chunks": 0, "previews": [], "note": "Invalid file id"})
            continue

        path = Path(row[0])
        if not path.exists():
            results.append({"file_id": fid, "total_chunks": 0, "previews": [], "note": "File path missing"})
            continue

        # extract text
        if path.suffix.lower() == ".pdf":
            text = _read_pdf(path)
        else:
            text = path.read_text(encoding="utf-8", errors="ignore")

        # split
        pieces = _split_text(text, spec)

        # write chunks
        previews = []
        async with db_conn() as (conn, cur):
            # clear existing chunks for idempotency (optional)
            await cur.execute("DELETE FROM chunks WHERE file_id=%s", (fid,))
            idx = 0
            for t in pieces:
                idx += 1
                token_count = len(t.split())
                await cur.execute("""
                    INSERT INTO chunks (file_id, idx, content, token_count)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id
                """, (fid, idx, t, token_count))
                row2 = await cur.fetchone()
                if idx <= 3:
                    previews.append({"chunk_id": row2[0], "preview": t[:160]})
            await conn.commit()

        results.append({
            "file_id": fid,
            "total_chunks": len(pieces),
            "previews": previews
        })

    return results
