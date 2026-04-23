from __future__ import annotations

from dataclasses import dataclass, field
import os


@dataclass(frozen=True, slots=True)
class OCRConfig:
    native_pdf_min_chars_per_page: int = 200
    native_pdf_min_printable_ratio: float = 0.92
    native_pdf_min_unique_chars: int = 20
    raster_dpi: int = 260
    min_block_confidence: float = 0.48
    review_block_confidence: float = 0.68
    flashcard_min_block_confidence: float = 0.58
    flashcard_min_page_score: float = 0.45
    max_correction_edit_distance: int = 2
    max_correction_ratio: float = 0.34
    enable_paddleocr: bool = False
    enable_trocr: bool = False
    enable_formula_ocr: bool = False
    enable_nougat: bool = False
    formula_engine_name: str = "pix2tex"
    printed_engine_name: str = "paddleocr"
    handwriting_engine_name: str = "trocr"
    protected_vocabulary: set[str] = field(default_factory=set)
    domain_lexicon: set[str] = field(default_factory=set)


def _flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _csv_words(name: str) -> set[str]:
    return {w.strip() for w in (os.getenv(name) or "").split(",") if w.strip()}


def load_ocr_config() -> OCRConfig:
    academic = {
        "algorithm",
        "analysis",
        "definition",
        "function",
        "matrix",
        "probability",
        "theorem",
        "variable",
        "vector",
    }
    protected = {
        "api",
        "cpu",
        "gpu",
        "http",
        "https",
        "json",
        "latex",
        "pdf",
        "url",
    }
    return OCRConfig(
        native_pdf_min_chars_per_page=int(os.getenv("OCR_NATIVE_MIN_CHARS_PER_PAGE", "200")),
        native_pdf_min_printable_ratio=float(os.getenv("OCR_NATIVE_MIN_PRINTABLE_RATIO", "0.92")),
        native_pdf_min_unique_chars=int(os.getenv("OCR_NATIVE_MIN_UNIQUE_CHARS", "20")),
        raster_dpi=int(os.getenv("OCR_RASTER_DPI", "260")),
        min_block_confidence=float(os.getenv("OCR_MIN_BLOCK_CONFIDENCE", "0.48")),
        review_block_confidence=float(os.getenv("OCR_REVIEW_BLOCK_CONFIDENCE", "0.68")),
        flashcard_min_block_confidence=float(os.getenv("OCR_FLASHCARD_MIN_BLOCK_CONFIDENCE", "0.58")),
        flashcard_min_page_score=float(os.getenv("OCR_FLASHCARD_MIN_PAGE_SCORE", "0.45")),
        max_correction_edit_distance=int(os.getenv("OCR_MAX_CORRECTION_EDIT_DISTANCE", "2")),
        max_correction_ratio=float(os.getenv("OCR_MAX_CORRECTION_RATIO", "0.34")),
        enable_paddleocr=_flag("OCR_ENABLE_PADDLEOCR"),
        enable_trocr=_flag("OCR_ENABLE_TROCR"),
        enable_formula_ocr=_flag("OCR_ENABLE_FORMULA_OCR"),
        enable_nougat=_flag("OCR_ENABLE_NOUGAT"),
        formula_engine_name=os.getenv("OCR_FORMULA_ENGINE", "pix2tex"),
        printed_engine_name=os.getenv("OCR_PRINTED_ENGINE", "paddleocr"),
        handwriting_engine_name=os.getenv("OCR_HANDWRITING_ENGINE", "trocr"),
        protected_vocabulary={*protected, *_csv_words("OCR_PROTECTED_VOCABULARY")},
        domain_lexicon={*academic, *_csv_words("OCR_DOMAIN_LEXICON")},
    )
