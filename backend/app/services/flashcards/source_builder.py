from __future__ import annotations

from app.services.ocr.config import OCRConfig, load_ocr_config
from app.services.ocr.schema import OCRPage


def build_flashcard_source_pages(pages: list[OCRPage], config: OCRConfig | None = None) -> list[str]:
    cfg = config or load_ocr_config()
    out: list[str] = []
    for page in pages:
        if page.metrics.flashcard_eligibility_score < cfg.flashcard_min_page_score:
            out.append("")
            continue
        page_lines: list[str] = []
        for block in sorted(page.blocks, key=lambda b: b.reading_order):
            if block.type == "formula" and block.latex and block.confidence >= 0.35:
                page_lines.append(block.latex)
                continue
            if block.confidence < cfg.flashcard_min_block_confidence:
                continue
            if block.needs_review and block.uncertain_spans:
                continue
            text = (block.normalized_text or block.raw_text).strip()
            if text:
                page_lines.append(text)
        out.append("\n\n".join(page_lines).strip())
    return out
