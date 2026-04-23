from __future__ import annotations

from dataclasses import dataclass
import io
import json
import logging
import mimetypes
from pathlib import Path
import tempfile
import time
from typing import Callable

from pypdf import PdfReader

from app.services.flashcards.source_builder import build_flashcard_source_pages
from app.services.image_enhancement import EnhancementVariant, build_enhancement_variants
from app.services.ocr.config import OCRConfig, load_ocr_config
from app.services.ocr.formula_ocr import FormulaOCR
from app.services.ocr.handwriting_ocr import HandwritingOCR
from app.services.ocr.normalize import document_markdown, normalize_whitespace, page_to_markdown
from app.services.ocr.postprocess import postprocess_blocks
from app.services.ocr.printed_ocr import PaddlePrintedOCR, PrintedOCREngine, TesseractPrintedOCR
from app.services.ocr.quality import aggregate_metrics, page_metrics, printable_ratio
from app.services.ocr.schema import (
    BoundingBox,
    DocumentOCRResult,
    ExtractionMethod,
    OCRBlock,
    OCRPage,
)
from app.services.page_router import classify_page, route_regions

log = logging.getLogger("uvicorn.error")

ArtifactWriter = Callable[[str, bytes, str], str]


@dataclass(slots=True)
class ExtractionInput:
    file_id: str
    filename: str
    mime_type: str | None
    data: bytes
    output_prefix: str | None = None


def default_artifact_writer(name: str, data: bytes, content_type: str) -> str:
    return name


def detect_file_type(filename: str, mime_type: str | None) -> str:
    lower = filename.lower()
    if (mime_type or "").lower() == "application/pdf" or lower.endswith(".pdf"):
        return "pdf"
    if (mime_type or "").lower().startswith("image/") or lower.endswith((".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp")):
        return "image"
    guessed, _ = mimetypes.guess_type(filename)
    if guessed == "application/pdf":
        return "pdf"
    if guessed and guessed.startswith("image/"):
        return "image"
    return "unknown"


def _native_pdf_pages(pdf_bytes: bytes) -> list[str]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    if getattr(reader, "is_encrypted", False):
        try:
            reader.decrypt("")
        except Exception:
            pass
    pages: list[str] = []
    for page in reader.pages:
        try:
            pages.append(normalize_whitespace(page.extract_text() or ""))
        except Exception:
            pages.append("")
    return pages


def _native_pdf_reliable(pages: list[str], config: OCRConfig) -> bool:
    populated = [p for p in pages if p.strip()]
    if not populated:
        return False
    avg_chars = sum(len(p) for p in populated) / max(1, len(pages))
    joined = "\n".join(populated)
    return (
        avg_chars >= config.native_pdf_min_chars_per_page
        and printable_ratio(joined) >= config.native_pdf_min_printable_ratio
        and len(set(joined)) >= config.native_pdf_min_unique_chars
    )


def _page_from_native(file_id: str, page_number: int, text: str, config: OCRConfig) -> OCRPage:
    block = OCRBlock(
        type="text",
        bbox=None,
        raw_text=text,
        normalized_text=text,
        confidence=0.98,
        engine="native_pdf",
        reading_order=0,
    )
    page_type = classify_page(text, average_confidence=block.confidence)
    page = OCRPage(
        page_number=page_number,
        page_type=page_type,
        blocks=[block],
        regions=route_regions(text, page_type),
    )
    page.metrics = page_metrics(page.blocks)
    page.markdown = page_to_markdown(page, config)
    return page


def _rasterize_pdf(pdf_path: Path, out_dir: Path, dpi: int) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        import fitz

        paths: list[Path] = []
        zoom = dpi / 72.0
        matrix = fitz.Matrix(zoom, zoom)
        with fitz.open(pdf_path) as doc:
            for idx, page in enumerate(doc, 1):
                pix = page.get_pixmap(matrix=matrix, alpha=False)
                path = out_dir / f"page-{idx:04d}.png"
                pix.save(path)
                paths.append(path)
        return paths
    except Exception:
        pass

    import subprocess

    prefix = out_dir / "page"
    subprocess.check_call(["pdftoppm", "-r", str(dpi), "-png", str(pdf_path), str(prefix)])
    return sorted(out_dir.glob("page-*.png"))


def _image_dimensions(image_path: Path) -> tuple[int | None, int | None]:
    try:
        from PIL import Image

        with Image.open(image_path) as img:
            return img.size
    except Exception:
        return None, None


def _select_printed_engine(config: OCRConfig) -> PrintedOCREngine:
    if config.enable_paddleocr:
        return PaddlePrintedOCR()
    return TesseractPrintedOCR()


def _score_blocks(blocks: list[OCRBlock]) -> float:
    if not blocks:
        return 0.0
    text_len = sum(len((b.raw_text or "").strip()) for b in blocks)
    confidence = sum(b.confidence for b in blocks) / max(1, len(blocks))
    review_penalty = sum(1 for b in blocks if b.needs_review) / max(1, len(blocks))
    return confidence * 0.75 + min(1.0, text_len / 1000) * 0.2 - review_penalty * 0.25


def _extract_best_printed(
    variants: list[EnhancementVariant],
    engine: PrintedOCREngine,
) -> tuple[list[OCRBlock], EnhancementVariant, list[dict[str, object]]]:
    attempts: list[dict[str, object]] = []
    best_blocks: list[OCRBlock] = []
    best_variant = variants[0]
    best_score = -1.0
    for variant in variants:
        start = time.perf_counter()
        blocks = engine.extract(variant.path)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        score = _score_blocks(blocks)
        attempts.append(
            {
                "engine": getattr(engine, "name", "printed_ocr"),
                "variant": variant.name,
                "score": round(score, 4),
                "elapsed_ms": elapsed_ms,
                "metrics": variant.metrics,
                "block_count": len(blocks),
            }
        )
        if score > best_score:
            best_score = score
            best_blocks = blocks
            best_variant = variant
    return best_blocks, best_variant, attempts


def _ocr_page(
    page_number: int,
    image_path: Path,
    filename: str,
    config: OCRConfig,
    artifact_writer: ArtifactWriter,
    output_prefix: str | None,
) -> tuple[OCRPage, list[dict[str, object]]]:
    width, height = _image_dimensions(image_path)
    variant_dir = image_path.parent / f"{image_path.stem}-enhanced"
    variants = build_enhancement_variants(image_path, variant_dir)
    original_key = artifact_writer(
        f"pages/page-{page_number:04d}/original.png",
        image_path.read_bytes(),
        "image/png",
    )
    enhanced_keys = [
        artifact_writer(
            f"pages/page-{page_number:04d}/enhanced/{variant.name}{variant.path.suffix}",
            variant.path.read_bytes(),
            "image/png",
        )
        for variant in variants
        if variant.path.exists()
    ]

    printed_engine = _select_printed_engine(config)
    printed_blocks, selected, attempts = _extract_best_printed(variants, printed_engine)
    text_hint = "\n".join(b.raw_text for b in printed_blocks)
    provisional_conf = _score_blocks(printed_blocks)
    page_type = classify_page(
        text_hint,
        average_confidence=provisional_conf,
        image_width=width,
        image_height=height,
        source_name=filename,
    )
    regions = route_regions(text_hint, page_type, width, height)
    blocks = list(printed_blocks)

    if page_type in {"handwritten_page", "mixed_page"}:
        start = time.perf_counter()
        handwriting_blocks = HandwritingOCR(enabled=config.enable_trocr).extract(selected.path)
        attempts.append(
            {
                "engine": "trocr",
                "variant": selected.name,
                "elapsed_ms": int((time.perf_counter() - start) * 1000),
                "block_count": len(handwriting_blocks),
            }
        )
        blocks.extend(handwriting_blocks)

    if page_type in {"formula_heavy_page", "mixed_page"}:
        start = time.perf_counter()
        formula_blocks = FormulaOCR(enabled=config.enable_formula_ocr).extract(selected.path, text_hint=text_hint)
        attempts.append(
            {
                "engine": config.formula_engine_name,
                "variant": selected.name,
                "elapsed_ms": int((time.perf_counter() - start) * 1000),
                "block_count": len(formula_blocks),
            }
        )
        blocks.extend(formula_blocks)

    for idx, block in enumerate(blocks):
        block.reading_order = idx
        if block.confidence < config.review_block_confidence:
            block.needs_review = True
    blocks = postprocess_blocks(blocks, config)

    page = OCRPage(
        page_number=page_number,
        page_type=page_type,
        blocks=blocks,
        regions=regions,
        selected_preprocessing=selected.name,
        original_image_key=original_key,
        enhanced_image_keys=enhanced_keys,
    )
    page.metrics = page_metrics(blocks, width, height)
    if page.metrics.flashcard_eligibility_score < config.flashcard_min_page_score:
        page.warnings.append("Page below flashcard eligibility threshold; low-confidence blocks will be skipped.")
        page.debug_thumbnail_key = original_key
    page.markdown = page_to_markdown(page, config)
    return page, attempts


def extract_document(
    payload: ExtractionInput,
    *,
    config: OCRConfig | None = None,
    artifact_writer: ArtifactWriter = default_artifact_writer,
) -> DocumentOCRResult:
    cfg = config or load_ocr_config()
    file_type = detect_file_type(payload.filename, payload.mime_type)
    warnings: list[str] = []
    raw: dict[str, object] = {
        "file_type": file_type,
        "filename": payload.filename,
        "engine_attempts": [],
    }

    if file_type == "pdf":
        try:
            native_pages = _native_pdf_pages(payload.data)
        except Exception as exc:
            native_pages = []
            warnings.append(f"Native PDF extraction failed: {exc}")
        if _native_pdf_reliable(native_pages, cfg):
            pages = [_page_from_native(payload.file_id, idx, text, cfg) for idx, text in enumerate(native_pages, 1)]
            md = document_markdown(pages, cfg)
            return DocumentOCRResult(
                file_id=payload.file_id,
                method=ExtractionMethod.NATIVE_PDF,
                pages=pages,
                markdown=md,
                raw={**raw, "native_text_pages": native_pages},
                metrics=aggregate_metrics(pages),
                correction_log=[],
                warnings=warnings,
            )

    pages: list[OCRPage] = []
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        if file_type == "pdf":
            source = tmpdir / "input.pdf"
            source.write_bytes(payload.data)
            image_paths = _rasterize_pdf(source, tmpdir / "rasterized", cfg.raster_dpi)
        elif file_type == "image":
            suffix = Path(payload.filename).suffix or ".png"
            source = tmpdir / f"input-image{suffix}"
            source.write_bytes(payload.data)
            image_paths = [source]
        else:
            warnings.append("Unsupported file type for OCR; no extraction performed.")
            image_paths = []

        all_attempts: list[dict[str, object]] = []
        for idx, image_path in enumerate(image_paths, 1):
            page, attempts = _ocr_page(
                idx,
                image_path,
                payload.filename,
                cfg,
                artifact_writer,
                payload.output_prefix,
            )
            pages.append(page)
            all_attempts.extend({"page": idx, **attempt} for attempt in attempts)
        raw["engine_attempts"] = all_attempts

    correction_log: list[dict[str, object]] = []
    for page in pages:
        for block in page.blocks:
            for correction in block.corrections:
                correction_log.append(
                    {
                        "page_number": page.page_number,
                        "engine": block.engine,
                        **correction.to_dict(),
                    }
                )
    safe_page_texts = build_flashcard_source_pages(pages, cfg)
    md = document_markdown(pages, cfg)
    raw["flashcard_source_pages"] = safe_page_texts
    return DocumentOCRResult(
        file_id=payload.file_id,
        method=ExtractionMethod.OCR if pages else ExtractionMethod.PARTIAL,
        pages=pages,
        markdown=md,
        raw=raw,
        metrics=aggregate_metrics(pages),
        correction_log=correction_log,
        warnings=warnings,
    )


def result_json_bytes(result: DocumentOCRResult) -> bytes:
    return json.dumps(result.to_dict(), ensure_ascii=False, indent=2).encode("utf-8")
