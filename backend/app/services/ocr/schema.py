from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal


BlockType = Literal["text", "handwriting", "formula", "title", "list", "table", "unknown"]
RegionType = Literal["printed_text", "handwriting", "formula", "table", "image"]
PageType = Literal[
    "printed_text_page",
    "handwritten_page",
    "mixed_page",
    "formula_heavy_page",
    "low_quality_page",
]


class ExtractionMethod(str, Enum):
    NATIVE_PDF = "native_pdf"
    OCR = "ocr"
    MIXED = "mixed"
    PARTIAL = "partial"


@dataclass(slots=True)
class BoundingBox:
    x0: float
    y0: float
    x1: float
    y1: float

    def as_list(self) -> list[float]:
        return [self.x0, self.y0, self.x1, self.y1]


@dataclass(slots=True)
class Correction:
    original: str
    replacement: str
    reason: str
    confidence: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "original": self.original,
            "replacement": self.replacement,
            "reason": self.reason,
            "confidence": round(self.confidence, 4),
        }


@dataclass(slots=True)
class OCRBlock:
    type: BlockType
    bbox: BoundingBox | None
    raw_text: str
    normalized_text: str
    confidence: float
    engine: str
    latex: str | None = None
    needs_review: bool = False
    reading_order: int = 0
    corrections: list[Correction] = field(default_factory=list)
    uncertain_spans: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def display_text(self) -> str:
        if self.type == "formula" and self.latex:
            return self.latex
        return self.normalized_text or self.raw_text

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "bbox": self.bbox.as_list() if self.bbox else None,
            "raw_text": self.raw_text,
            "normalized_text": self.normalized_text,
            "latex": self.latex,
            "confidence": round(self.confidence, 4),
            "engine": self.engine,
            "needs_review": self.needs_review,
            "reading_order": self.reading_order,
            "corrections": [c.to_dict() for c in self.corrections],
            "uncertain_spans": self.uncertain_spans,
            "metadata": self.metadata,
        }


@dataclass(slots=True)
class Region:
    type: RegionType
    bbox: BoundingBox | None
    confidence: float
    reason: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "bbox": self.bbox.as_list() if self.bbox else None,
            "confidence": round(self.confidence, 4),
            "reason": self.reason,
        }


@dataclass(slots=True)
class PageMetrics:
    ocr_confidence: float = 0.0
    character_anomaly_score: float = 0.0
    suspicious_token_ratio: float = 0.0
    unreadable_block_ratio: float = 0.0
    formula_parse_success: float = 1.0
    text_density: float = 0.0
    correction_count: int = 0
    flashcard_eligibility_score: float = 0.0
    uncertain_region_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "ocr_confidence": round(self.ocr_confidence, 4),
            "character_anomaly_score": round(self.character_anomaly_score, 4),
            "suspicious_token_ratio": round(self.suspicious_token_ratio, 4),
            "unreadable_block_ratio": round(self.unreadable_block_ratio, 4),
            "formula_parse_success": round(self.formula_parse_success, 4),
            "text_density": round(self.text_density, 4),
            "correction_count": self.correction_count,
            "flashcard_eligibility_score": round(self.flashcard_eligibility_score, 4),
            "uncertain_region_count": self.uncertain_region_count,
        }


@dataclass(slots=True)
class OCRPage:
    page_number: int
    page_type: PageType
    blocks: list[OCRBlock]
    regions: list[Region] = field(default_factory=list)
    markdown: str = ""
    metrics: PageMetrics = field(default_factory=PageMetrics)
    warnings: list[str] = field(default_factory=list)
    selected_preprocessing: str | None = None
    original_image_key: str | None = None
    enhanced_image_keys: list[str] = field(default_factory=list)
    debug_thumbnail_key: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "page_number": self.page_number,
            "page_type": self.page_type,
            "blocks": [b.to_dict() for b in self.blocks],
            "regions": [r.to_dict() for r in self.regions],
            "markdown": self.markdown,
            "metrics": self.metrics.to_dict(),
            "warnings": self.warnings,
            "selected_preprocessing": self.selected_preprocessing,
            "original_image_key": self.original_image_key,
            "enhanced_image_keys": self.enhanced_image_keys,
            "debug_thumbnail_key": self.debug_thumbnail_key,
        }


@dataclass(slots=True)
class DocumentOCRResult:
    file_id: str
    method: ExtractionMethod
    pages: list[OCRPage]
    markdown: str
    raw: dict[str, Any]
    metrics: dict[str, Any]
    correction_log: list[dict[str, Any]]
    warnings: list[str] = field(default_factory=list)
    storage_manifest: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "file_id": self.file_id,
            "method": self.method.value,
            "pages": [p.to_dict() for p in self.pages],
            "markdown": self.markdown,
            "raw": self.raw,
            "metrics": self.metrics,
            "correction_log": self.correction_log,
            "warnings": self.warnings,
            "storage_manifest": self.storage_manifest,
        }
