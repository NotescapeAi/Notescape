from __future__ import annotations

import re

from app.services.ocr.quality import character_anomaly_score, has_formula_hints, suspicious_token_ratio
from app.services.ocr.schema import BoundingBox, PageType, Region

_HANDWRITING_HINTS = re.compile(r"\b(handwritten|scribble|cursive|note\s*scan)\b", re.I)


def classify_page(
    text_hint: str = "",
    *,
    average_confidence: float = 0.0,
    image_width: int | None = None,
    image_height: int | None = None,
    source_name: str = "",
) -> PageType:
    text = text_hint or ""
    if _HANDWRITING_HINTS.search(source_name):
        return "handwritten_page"
    if average_confidence and average_confidence < 0.35:
        return "low_quality_page"
    if text and (character_anomaly_score(text) > 0.35 or suspicious_token_ratio(text) > 0.45):
        return "low_quality_page"
    if has_formula_hints(text):
        math_chars = len(re.findall(r"[=+\-*/^_\\∑∫√≈≤≥≠∞]", text))
        if math_chars >= max(3, len(text) // 70):
            return "formula_heavy_page"
    if average_confidence and average_confidence < 0.62 and len(text.strip()) < 300:
        return "handwritten_page"
    if has_formula_hints(text) and len(text.strip()) > 30:
        return "mixed_page"
    return "printed_text_page"


def route_regions(text_hint: str, page_type: PageType, width: int | None = None, height: int | None = None) -> list[Region]:
    bbox = BoundingBox(0, 0, float(width or 1), float(height or 1))
    if page_type == "formula_heavy_page":
        return [
            Region("formula", bbox, 0.76, "formula density exceeded threshold"),
            Region("printed_text", bbox, 0.58, "formula-heavy pages may contain explanatory text"),
        ]
    if page_type == "handwritten_page":
        return [Region("handwriting", bbox, 0.7, "page classified as handwriting-heavy")]
    if page_type == "mixed_page":
        regions = [Region("printed_text", bbox, 0.7, "mixed page text route")]
        if has_formula_hints(text_hint):
            regions.append(Region("formula", bbox, 0.68, "math symbols detected"))
        regions.append(Region("handwriting", bbox, 0.45, "mixed page fallback handwriting route"))
        return regions
    if page_type == "low_quality_page":
        return [Region("image", bbox, 0.45, "low quality page preserved for review")]
    return [Region("printed_text", bbox, 0.82, "default printed text route")]
