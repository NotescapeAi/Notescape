# backend/app/lib/chunking.py
from typing import List, Dict
from pypdf import PdfReader

def extract_page_texts(pdf_path: str) -> List[str]:
    """Return plain text for each page (empty string when no text)."""
    reader = PdfReader(pdf_path)
    out: List[str] = []
    for p in reader.pages:
        txt = p.extract_text() or ""
        out.append(txt.strip())
    return out

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
