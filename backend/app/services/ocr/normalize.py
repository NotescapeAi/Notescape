from __future__ import annotations

import re

from app.services.ocr.config import OCRConfig
from app.services.ocr.schema import OCRBlock, OCRPage


def normalize_whitespace(text: str) -> str:
    text = re.sub(r"\r\n?", "\n", text or "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def markdown_for_blocks(blocks: list[OCRBlock], config: OCRConfig) -> str:
    parts: list[str] = []
    for block in sorted(blocks, key=lambda b: b.reading_order):
        if block.confidence < config.min_block_confidence and block.type != "formula":
            continue
        if block.type == "formula":
            if block.latex:
                latex = block.latex.strip()
                if latex.startswith("$"):
                    parts.append(latex)
                else:
                    parts.append(f"$$\n{latex}\n$$")
            elif block.needs_review:
                parts.append("[Uncertain formula region omitted from flashcard source.]")
            continue
        text = normalize_whitespace(block.normalized_text or block.raw_text)
        if not text:
            continue
        if block.needs_review and block.confidence < config.flashcard_min_block_confidence:
            continue
        parts.append(text)
    return "\n\n".join(parts).strip()


def page_to_markdown(page: OCRPage, config: OCRConfig) -> str:
    return markdown_for_blocks(page.blocks, config)


def document_markdown(pages: list[OCRPage], config: OCRConfig) -> str:
    page_parts: list[str] = []
    for page in pages:
        md = page.markdown or page_to_markdown(page, config)
        if not md:
            continue
        page_parts.append(f"<!-- page:{page.page_number} type:{page.page_type} -->\n{md}")
    return "\n\n".join(page_parts).strip()
