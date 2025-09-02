# backend/app/lib/chunking.py
from typing import List, Dict
from pathlib import Path
import logging
import regex as re

from pypdf import PdfReader

# Optional backends
try:
    from pdfminer.high_level import extract_pages as pdfminer_extract_pages
    from pdfminer.layout import LTTextContainer
except Exception:
    pdfminer_extract_pages = None

try:
    import fitz  # PyMuPDF
except Exception:
    fitz = None

log = logging.getLogger("uvicorn.error")


def _normalize(s: str) -> str:
    s = re.sub(r"\r\n?", "\n", s or "")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def _extract_with_pdfminer(pdf_path: Path) -> List[str]:
    if pdfminer_extract_pages is None:
        raise RuntimeError("pdfminer.six not installed")
    pages: List[str] = []
    for layout in pdfminer_extract_pages(str(pdf_path)):
        buf = []
        for el in layout:
            if isinstance(el, LTTextContainer):
                buf.append(el.get_text())
        pages.append(_normalize("".join(buf)))
    return pages


def _extract_with_pymupdf(pdf_path: Path) -> List[str]:
    if fitz is None:
        raise RuntimeError("PyMuPDF not installed")
    out: List[str] = []
    with fitz.open(pdf_path) as doc:
        for page in doc:
            t = page.get_text("text") or ""
            if len(t) < 5:
                # fallback: join text blocks if plain text is oddly short
                blocks = page.get_text("blocks") or []
                t2 = "\n".join(b[4] for b in blocks if len(b) >= 5 and isinstance(b[4], str))
                if len(t2) > len(t):
                    t = t2
            out.append(_normalize(t))
    return out


def _extract_with_pypdf(pdf_path: Path) -> List[str]:
    reader = PdfReader(str(pdf_path))
    if getattr(reader, "is_encrypted", False):
        try:
            reader.decrypt("")  # some PDFs are empty-password encrypted
        except Exception:
            pass
    out: List[str] = []
    for p in reader.pages:
        try:
            txt = p.extract_text() or ""
        except Exception:
            txt = ""
        out.append(_normalize(txt))
    return out


def extract_page_texts(pdf_path: str) -> List[str]:
    """
    Return plain text for each page (empty string when truly none).
    Tries: pdfminer -> PyMuPDF -> pypdf.
    """
    p = Path(pdf_path)
    if not p.exists():
        return []

    errors = []

    # 1) pdfminer (best for weird encodings)
    try:
        pages = _extract_with_pdfminer(p)
        if any(x.strip() for x in pages):
            log.info(f"[lib.chunking] extracted via pdfminer: {p.name}")
            return pages
    except Exception as e:
        errors.append(f"pdfminer: {e}")

    # 2) PyMuPDF (fast & robust)
    try:
        pages = _extract_with_pymupdf(p)
        if any(x.strip() for x in pages):
            log.info(f"[lib.chunking] extracted via pymupdf: {p.name}")
            return pages
    except Exception as e:
        errors.append(f"pymupdf: {e}")

    # 3) pypdf (fallback)
    try:
        pages = _extract_with_pypdf(p)
        log.info(f"[lib.chunking] extracted via pypdf: {p.name}")
        return pages
    except Exception as e:
        errors.append(f"pypdf: {e}")
        log.warning(f"[lib.chunking] all extractors failed for {p.name}: {' | '.join(errors)}")
        return []


def chunk_by_pages(page_texts: List[str], pages_per_chunk: int = 1, overlap_pages: int = 0) -> List[Dict]:
    """
    Make chunks on page boundaries.
    - pages_per_chunk=1 => one chunk per page.
    - overlap_pages>0    => slide the window with page overlap.
    """
    pages_per_chunk = max(1, int(pages_per_chunk))
    overlap_pages = max(0, int(overlap_pages))
    step = max(1, pages_per_chunk - overlap_pages)

    chunks: List[Dict] = []
    i = 0
    idx = 0
    n = len(page_texts)

    while i < n:
        start = i
        end = min(n, i + pages_per_chunk)
        block = "\n\n".join(page_texts[start:end]).strip()
        if block:
            chunks.append({
                "idx": idx,
                "content": block,
                "char_len": len(block),
                "page_start": start + 1,  # 1-based for UI
                "page_end": end,
            })
            idx += 1
        i += step

    return chunks


def chunk_by_chars(text: str, size_chars: int = 1200, overlap_chars: int = 200) -> List[Dict]:
    """Simple char-based chunking (no tokens needed)."""
    size_chars = max(1, int(size_chars))
    overlap_chars = max(0, int(overlap_chars))
    step = max(1, size_chars - overlap_chars)

    chunks: List[Dict] = []
    idx = 0
    for i in range(0, len(text), step):
        block = text[i:i + size_chars].strip()
        if block:
            chunks.append({
                "idx": idx,
                "content": block,
                "char_len": len(block),
                "page_start": None,
                "page_end": None,
            })
            idx += 1
    return chunks
