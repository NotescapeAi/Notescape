from __future__ import annotations

import math
import re
from statistics import mean

from app.services.ocr.schema import OCRBlock, OCRPage, PageMetrics

_SUSPICIOUS_RE = re.compile(r"^[^\w\s]{3,}$|[A-Za-z]{1,2}\d[A-Za-z]\d|(.)\1{5,}")
_FORMULA_HINT_RE = re.compile(r"(\\[a-zA-Z]+|[∑∫√≈≤≥≠∞]|[A-Za-z]\s*[=<>]\s*[-+*/^()A-Za-z0-9])")


def printable_ratio(text: str) -> float:
    if not text:
        return 0.0
    printable = sum(1 for ch in text if ch.isprintable() or ch in "\n\t")
    return printable / max(1, len(text))


def character_anomaly_score(text: str) -> float:
    if not text:
        return 1.0
    bad = sum(1 for ch in text if not (ch.isprintable() or ch in "\n\t"))
    symbol = sum(1 for ch in text if not (ch.isalnum() or ch.isspace() or ch in ".,;:!?()[]{}+-=*/\\_$%#@'\"<>|"))
    return min(1.0, (bad + symbol * 0.5) / max(1, len(text)))


def suspicious_token_ratio(text: str) -> float:
    tokens = re.findall(r"\S+", text or "")
    if not tokens:
        return 1.0
    suspicious = sum(1 for token in tokens if _SUSPICIOUS_RE.search(token))
    return suspicious / len(tokens)


def text_density(text: str, width: int | None = None, height: int | None = None) -> float:
    chars = len((text or "").strip())
    if not width or not height:
        return min(1.0, chars / 1200)
    return min(1.0, chars / max(1.0, (width * height / 2000)))


def has_formula_hints(text: str) -> bool:
    return bool(_FORMULA_HINT_RE.search(text or ""))


def page_metrics(blocks: list[OCRBlock], width: int | None = None, height: int | None = None) -> PageMetrics:
    texts = "\n".join(b.display_text() for b in blocks)
    confs = [b.confidence for b in blocks if b.confidence > 0]
    unreadable = [b for b in blocks if b.needs_review or b.confidence < 0.35]
    formulas = [b for b in blocks if b.type == "formula"]
    parsed_formulas = [b for b in formulas if b.latex and not b.needs_review]
    correction_count = sum(len(b.corrections) for b in blocks)
    uncertain = sum(len(b.uncertain_spans) for b in blocks)
    formula_success = 1.0 if not formulas else len(parsed_formulas) / len(formulas)
    avg_conf = mean(confs) if confs else 0.0
    anomaly = character_anomaly_score(texts)
    suspicious = suspicious_token_ratio(texts)
    unreadable_ratio = len(unreadable) / max(1, len(blocks))
    density = text_density(texts, width, height)
    score = avg_conf
    score *= 1.0 - min(0.7, anomaly)
    score *= 1.0 - min(0.6, suspicious)
    score *= 1.0 - min(0.7, unreadable_ratio)
    score *= 0.75 + 0.25 * formula_success
    if correction_count:
        score *= max(0.6, 1.0 - math.log1p(correction_count) / 12)
    return PageMetrics(
        ocr_confidence=avg_conf,
        character_anomaly_score=anomaly,
        suspicious_token_ratio=suspicious,
        unreadable_block_ratio=unreadable_ratio,
        formula_parse_success=formula_success,
        text_density=density,
        correction_count=correction_count,
        flashcard_eligibility_score=max(0.0, min(1.0, score)),
        uncertain_region_count=uncertain,
    )


def aggregate_metrics(pages: list[OCRPage]) -> dict[str, float | int]:
    if not pages:
        return {
            "page_count": 0,
            "average_confidence": 0.0,
            "average_flashcard_eligibility_score": 0.0,
            "uncertain_region_count": 0,
        }
    return {
        "page_count": len(pages),
        "average_confidence": round(mean(p.metrics.ocr_confidence for p in pages), 4),
        "average_flashcard_eligibility_score": round(
            mean(p.metrics.flashcard_eligibility_score for p in pages), 4
        ),
        "uncertain_region_count": sum(p.metrics.uncertain_region_count for p in pages),
        "low_quality_pages": sum(1 for p in pages if p.page_type == "low_quality_page"),
        "correction_count": sum(p.metrics.correction_count for p in pages),
    }
