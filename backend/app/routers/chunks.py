# app/routers/chunks.py
from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import List, Literal, Optional, Tuple, Dict, Any
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse
import regex as re
from uuid import UUID
import logging

from pypdf import PdfReader

from app.core.db import db_conn
from app.core.settings import settings

router = APIRouter(prefix="/api", tags=["chunks"])
log = logging.getLogger("uvicorn.error")

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
    s = re.sub(r"\r\n?", "\n", s or "")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()

def _chunk_chars(text: str, size: int, overlap: int) -> List[str]:
    """Simple char-based chunking with overlap."""
    text = text or ""
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
    Falls back to raw char chunking for huge single paragraphs.
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


def _read_pdf_pages(abs_pdf_path: Path) -> List[str]:
    if not abs_pdf_path.exists():
        return []
    reader = PdfReader(str(abs_pdf_path))
    if getattr(reader, "is_encrypted", False):
        try:
            reader.decrypt("")  # empty password PDFs
        except Exception:
            pass
    out: List[str] = []
    for p in reader.pages:
        try:
            page_text = p.extract_text() or ""
            if not page_text:
                log.warning(f"Empty page detected!")
            out.append(page_text)
        except Exception as e:
            log.error(f"Error extracting text from page: {p} | {str(e)}")
            out.append("")
    return out

def _rel_from_storage_url(storage_url: str) -> PurePosixPath:
    """
    Accepts '/uploads/...', 'uploads/...', or a full URL. Returns a path relative to 'uploads'.
    """
    try:
        parsed = urlparse(storage_url)
        path_part = parsed.path if parsed.scheme else storage_url
    except Exception:
        path_part = storage_url

    p = PurePosixPath(path_part)
    for head in ("/uploads", "uploads"):
        try:
            return p.relative_to(head)
        except Exception:
            pass
    return p  # already relative like 'class_37/file.pdf'

# ---------- Routes ----------

@router.get("/files/{file_id}/chunks")
async def list_chunks(
    file_id: str,
    limit: int = 20,
    offset: int = 0,
    full: bool = False,
) -> List[Dict[str, Any]]:
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
async def create_chunks(payload: ChunkRequest, request: Request) -> List[ChunkPreview]:
    """
    Creates chunks for each file id.
    Uses the SAME uploads folder mounted in main.py (request.app.state.uploads_root).
    """
    # Use the exact folder mounted by main.py; fall back to settings or ../uploads
    default_root = Path(settings.upload_root) if settings.upload_root else Path(__file__).resolve().parents[3] / "uploads"
    uploads_root = Path(getattr(request.app.state, "uploads_root", default_root))
    log.info(f"[chunks] uploads_root = {uploads_root}")

    results: List[ChunkPreview] = []

    for fid_str in payload.file_ids:
        # Validate UUID
        try:
            fid = UUID(fid_str)
        except Exception:
            results.append(ChunkPreview(file_id=fid_str, total_chunks=0, previews=[], note="Invalid file id"))
            continue

        # Fetch storage_url (and filename if available)
        async with db_conn() as (conn, cur):
            await cur.execute("SELECT storage_url FROM files WHERE id=%s", (fid,))
            row = await cur.fetchone()

        if not row:
            results.append(ChunkPreview(file_id=fid_str, total_chunks=0, previews=[], note="File not found in DB"))
            continue

        storage_url: str = row[0]
        rel = _rel_from_storage_url(storage_url)

        # Candidate paths (first one should usually exist)
        candidates = [
            (uploads_root / Path(rel.as_posix())).resolve(),
            (uploads_root / rel.name).resolve(),  # just the filename as a fallback
        ]

        abs_path = next((p for p in candidates if p.exists()), None)
        if not abs_path:
            tried = " | ".join(str(c) for c in candidates)
            log.warning(f"[chunks] no file on disk for {fid_str}. Tried: {tried}")
            results.append(ChunkPreview(
                file_id=fid_str, total_chunks=0, previews=[],
                note=f"File not found on disk. Tried: {tried}"
            ))
            continue

        # Extract page texts
        pages = _read_pdf_pages(abs_path)

        # Build chunks
        chunks: List[str] = []
        ranges: List[Tuple[Optional[int], Optional[int]]] = []

        if payload.by == "page":
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

        # Previews (FULL text in sample)
        previews = [{
            "idx": i,
            "page_start": ranges[i][0],
            "page_end": ranges[i][1],
            "char_len": len(c),
            "sample": c,
        } for i, c in enumerate(chunks[: payload.preview_limit_per_file])]

        note = None
        if sum(len(t.strip()) for t in pages) == 0:
            note = "No text extracted. If this is a digital PDF, try re-saving it or run OCR once."

        results.append(ChunkPreview(
            file_id=fid_str,
            total_chunks=len(chunks),
            previews=previews,
            note=note,
        ))

    return results
