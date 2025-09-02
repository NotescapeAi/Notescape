# app/routers/chunks.py
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Literal, Optional, Tuple
from pathlib import Path, PurePosixPath
import regex as re
from pypdf import PdfReader
from uuid import UUID

from app.core.db import db_conn
from app.core.settings import settings

router = APIRouter(prefix="/api", tags=["chunks"])

# ---------- Models ----------

class ChunkRequest(BaseModel):
    file_ids: List[str]
    by: Literal["auto", "page", "chars"] = "auto"
    size: int = 2000          # chars per chunk when by="auto"/"chars", or pages per chunk when by="page"
    overlap: int = 200        # char overlap (or page overlap for by="page")
    preview_limit_per_file: int = 3

class ChunkPreview(BaseModel):
    file_id: str
    total_chunks: int
    previews: list[dict]
    note: Optional[str] = None

# ---------- Helpers ----------

def _normalize(s: str) -> str:
    s = re.sub(r"\r\n?", "\n", s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()

def _read_pdf_pages(abs_pdf_path: Path) -> List[str]:
    if not abs_pdf_path.exists():
        return []
    reader = PdfReader(str(abs_pdf_path))
    out: List[str] = []
    for p in reader.pages:
        out.append(_normalize(p.extract_text() or ""))
    return out

def _chunk_chars(text: str, size: int, overlap: int) -> List[str]:
    if size <= 0:
        return [text] if text else []
    chunks: List[str] = []
    i = 0
    n = len(text)
    overlap = max(overlap, 0)
    while i < n:
        j = min(i + size, n)
        chunks.append(text[i:j])
        if j >= n:
            break
        i = max(j - overlap, 0)
    return chunks

def _chunk_text(text: str, size: int, overlap: int) -> List[str]:
    """
    Paragraph-aware chunking: packs paragraphs up to ~size, then overlaps by characters.
    Falls back to raw char chunking for giant single paragraphs.
    """
    text = text or ""
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paras:
        return []

    acc: List[str] = []
    buf: List[str] = []
    cur_len = 0
    for p in paras:
        extra = len(p) + (2 if buf else 0)  # +2 for "\n\n" join
        if cur_len + extra <= size or not buf:
            buf.append(p)
            cur_len += extra
        else:
            acc.append("\n\n".join(buf))
            if overlap > 0 and acc[-1]:
                tail = acc[-1][-overlap:]
                buf = [tail, p]
                cur_len = len(tail) + 2 + len(p)
            else:
                buf = [p]
                cur_len = len(p)
    if buf:
        acc.append("\n\n".join(buf))

    # If any chunk is way too big (e.g., one massive paragraph), split by chars.
    out: List[str] = []
    for c in acc:
        if len(c) > size * 1.5:
            out.extend(_chunk_chars(c, size, overlap))
        else:
            out.append(c)
    return out

# ---------- Routes ----------

@router.get("/files/{file_id}/chunks")
async def list_chunks(
    file_id: str,
    limit: int = 20,
    offset: int = 0,
    full: bool = False,
):
    """
    Returns chunks for a file.
    - When full=1, `sample` is the full content; otherwise it's trimmed to 400 chars.
    """
    async with db_conn() as (conn, cur):
        select_sample = "content AS sample" if full else \
            "CASE WHEN length(content) > 400 THEN substr(content, 1, 400) || '…' ELSE content END AS sample"
        await cur.execute(
            f"""
            SELECT id, idx, char_len, page_start, page_end, {select_sample}
            FROM file_chunks
            WHERE file_id=%s
            ORDER BY idx
            LIMIT %s OFFSET %s
            """,
            (file_id, limit, offset),
        )
        rows = await cur.fetchall()
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in rows]

@router.post("/chunks", response_model=List[ChunkPreview])
async def create_chunks(payload: ChunkRequest):
    """
    Creates chunks for each file id.
    - by="page": size=pages per chunk, overlap=page overlap
    - by="chars": size=chars per chunk, overlap=char overlap (no page ranges)
    - by="auto": paragraph-aware char chunking on the full document
    Returns a small preview list with **full** chunk text for the first N chunks.
    """
    uploads_root = Path(settings.upload_root) if settings.upload_root else Path(__file__).resolve().parents[2] / "uploads"
    results: List[ChunkPreview] = []

    for fid_str in payload.file_ids:
        # Validate UUID
        try:
            fid = UUID(fid_str)
        except Exception:
            results.append(ChunkPreview(file_id=fid_str, total_chunks=0, previews=[], note="Invalid file id"))
            continue

        # Fetch storage_url
        async with db_conn() as (conn, cur):
            await cur.execute("SELECT storage_url FROM files WHERE id=%s", (fid,))
            row = await cur.fetchone()

        if not row:
            results.append(ChunkPreview(file_id=fid_str, total_chunks=0, previews=[], note="File not found"))
            continue

        storage_url: str = row[0]
        try:
            rel = PurePosixPath(storage_url).relative_to("/uploads")
        except Exception:
            results.append(ChunkPreview(file_id=fid_str, total_chunks=0, previews=[], note="Bad storage path"))
            continue

        abs_path = uploads_root / rel

        # Extract page texts
        pages = _read_pdf_pages(abs_path)

        # Build chunks
        chunks: List[str] = []
        ranges: List[Tuple[Optional[int], Optional[int]]] = []

        if payload.by == "page":
            # 1 chunk = N pages
            pages_per_chunk = max(payload.size, 1)
            page_overlap = max(payload.overlap, 0)
            i = 0
            while i < len(pages):
                j = min(i + pages_per_chunk, len(pages))
                content = _normalize("\n\n".join(pages[i:j]))
                chunks.append(content)
                ranges.append((i + 1, j))  # 1-based inclusive page numbers
                if j >= len(pages):
                    break
                i = max(j - page_overlap, 0)
        elif payload.by == "chars":
            full = _normalize("\n\n".join(pages))
            chunks = _chunk_chars(full, payload.size, payload.overlap)
            ranges = [(None, None)] * len(chunks)
        else:  # "auto"
            full = _normalize("\n\n".join(pages))
            chunks = _chunk_text(full, payload.size, payload.overlap)
            ranges = [(None, None)] * len(chunks)

        # Replace existing chunks
        async with db_conn() as (conn, cur):
            await cur.execute("DELETE FROM file_chunks WHERE file_id=%s", (fid,))
            for idx, content in enumerate(chunks):
                ps, pe = ranges[idx]
                await cur.execute(
                    """
                    INSERT INTO file_chunks (file_id, idx, content, char_len, page_start, page_end)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (fid, idx, content, len(content), ps, pe),
                )
            await conn.commit()

        # Build previews (FULL text in sample)
        previews = [{
            "idx": i,
            "page_start": ranges[i][0],
            "page_end": ranges[i][1],
            "char_len": len(c),
            "sample": c,  # full chunk so you can see the whole page/chunk
        } for i, c in enumerate(chunks[: payload.preview_limit_per_file])]

        note = None
        if not any(pages):
            note = "No text extracted. This PDF may be scanned (image-only)."

        results.append(ChunkPreview(
            file_id=fid_str,
            total_chunks=len(chunks),
            previews=previews,
            note=note,
        ))

    return results
