from pathlib import Path
from typing import Tuple

from pypdf import PdfReader


def extract_text_first_pages(pdf_path: str, max_pages: int = 3) -> str:
    p = Path(pdf_path)
    if not p.exists():
        return ""
    reader = PdfReader(str(p))
    if getattr(reader, "is_encrypted", False):
        try:
            reader.decrypt("")
        except Exception:
            pass
    texts = []
    for i, page in enumerate(reader.pages):
        if i >= max_pages:
            break
        try:
            texts.append(page.extract_text() or "")
        except Exception:
            texts.append("")
    return "\n".join(texts)


def is_digital_text(text: str, min_chars: int = 200) -> bool:
    return len((text or "").strip()) >= min_chars


def detect_digital_pdf(pdf_path: str, max_pages: int = 3, min_chars: int = 200) -> Tuple[bool, str]:
    text = extract_text_first_pages(pdf_path, max_pages=max_pages)
    return is_digital_text(text, min_chars=min_chars), text
