from __future__ import annotations

from dataclasses import dataclass
import io
import json
import logging
import mimetypes
import re
from pathlib import Path
import tempfile
import time
from typing import Callable
import zipfile
import xml.etree.ElementTree as ET

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
    normalized_mime = (mime_type or "").lower()
    if (mime_type or "").lower() == "application/pdf" or lower.endswith(".pdf"):
        return "pdf"
    if normalized_mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or lower.endswith(".docx"):
        return "docx"
    if normalized_mime == "application/vnd.openxmlformats-officedocument.presentationml.presentation" or lower.endswith(".pptx"):
        return "pptx"
    if normalized_mime.startswith("image/") or lower.endswith((".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp")):
        return "image"
    guessed, _ = mimetypes.guess_type(filename)
    if guessed == "application/pdf":
        return "pdf"
    if guessed == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return "docx"
    if guessed == "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        return "pptx"
    if guessed and guessed.startswith("image/"):
        return "image"
    return "unknown"


def _xml_text(xml_bytes: bytes) -> str:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return ""
    texts: list[str] = []
    for node in root.iter():
        if node.tag.endswith("}t") and node.text:
            texts.append(node.text)
        elif node.tag.endswith("}tab"):
            texts.append("\t")
        elif node.tag.endswith("}br") or node.tag.endswith("}p"):
            texts.append("\n")
    return normalize_whitespace(" ".join(texts))


def _xml_text_lines(xml_bytes: bytes) -> list[str]:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return []
    lines: list[str] = []
    current: list[str] = []
    for node in root.iter():
        tag = node.tag.rsplit("}", 1)[-1]
        if tag == "t" and node.text:
            current.append(node.text)
        elif tag in {"br", "p"}:
            text = normalize_whitespace(" ".join(current))
            if text:
                lines.append(text)
            current = []
    text = normalize_whitespace(" ".join(current))
    if text:
        lines.append(text)
    return lines


def _docx_text_pages(data: bytes) -> list[str]:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        parts = ["word/document.xml"]
        parts.extend(sorted(name for name in zf.namelist() if re.fullmatch(r"word/header\d+\.xml", name)))
        parts.extend(sorted(name for name in zf.namelist() if re.fullmatch(r"word/footer\d+\.xml", name)))
        text = "\n\n".join(_xml_text(zf.read(part)) for part in parts if part in zf.namelist())
    text = normalize_whitespace(text)
    return [text] if text else []


def _pptx_slide_pages(data: bytes) -> list[dict[str, object]]:
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        slide_names = sorted(
            (name for name in zf.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)),
            key=lambda name: int(re.search(r"slide(\d+)\.xml", name).group(1)),
        )
        slides: list[dict[str, object]] = []
        for slide_name in slide_names:
            slide_number = int(re.search(r"slide(\d+)\.xml", slide_name).group(1))
            slide_xml = zf.read(slide_name)
            lines = _xml_text_lines(slide_xml)
            title = lines[0] if lines else ""
            body_lines = lines[1:] if len(lines) > 1 else lines
            notes_name = f"ppt/notesSlides/notesSlide{slide_number}.xml"
            notes = normalize_whitespace("\n".join(_xml_text_lines(zf.read(notes_name)))) if notes_name in zf.namelist() else ""

            alt_texts: list[str] = []
            try:
                root = ET.fromstring(slide_xml)
                for node in root.iter():
                    tag = node.tag.rsplit("}", 1)[-1]
                    if tag == "cNvPr":
                        descr = normalize_whitespace(node.attrib.get("descr", ""))
                        title_attr = normalize_whitespace(node.attrib.get("title", ""))
                        if descr:
                            alt_texts.append(descr)
                        if title_attr and title_attr not in alt_texts:
                            alt_texts.append(title_attr)
            except ET.ParseError:
                pass

            parts = [f"Slide {slide_number}"]
            if title:
                parts.append(f"Title: {title}")
            if body_lines:
                parts.append("Text:\n" + "\n".join(f"- {line}" for line in body_lines))
            if notes:
                parts.append("Speaker notes:\n" + notes)
            if alt_texts:
                parts.append("Image alt text:\n" + "\n".join(f"- {text}" for text in alt_texts))
            text = normalize_whitespace("\n\n".join(parts))
            slides.append(
                {
                    "slide_number": slide_number,
                    "title": title,
                    "text": "\n".join(body_lines).strip(),
                    "notes": notes,
                    "image_alt_text": alt_texts,
                    "source_type": "pptx",
                    "page_or_slide": slide_number,
                    "content": text,
                }
            )
        return slides


def _pptx_text_pages(data: bytes) -> list[str]:
    return [str(slide["content"]) for slide in _pptx_slide_pages(data) if str(slide.get("content") or "").strip()]


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


def _native_pdf_page_reliable(text: str, config: OCRConfig) -> bool:
    clean = normalize_whitespace(text or "")
    return (
        len(clean) >= config.native_pdf_min_chars_per_page
        and printable_ratio(clean) >= config.native_pdf_min_printable_ratio
        and len(set(clean)) >= min(config.native_pdf_min_unique_chars, 12)
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


def _native_text_result(
    payload: ExtractionInput,
    pages_text: list[str],
    method: ExtractionMethod,
    cfg: OCRConfig,
    raw: dict[str, object],
    warnings: list[str],
) -> DocumentOCRResult:
    pages = [_page_from_native(payload.file_id, idx, text, cfg) for idx, text in enumerate(pages_text, 1)]
    md = document_markdown(pages, cfg)
    return DocumentOCRResult(
        file_id=payload.file_id,
        method=method,
        pages=pages,
        markdown=md,
        raw={**raw, "native_text_pages": pages_text},
        metrics=aggregate_metrics(pages),
        correction_log=[],
        warnings=warnings,
    )


def _rasterize_pdf(pdf_path: Path, out_dir: Path, dpi: int, page_numbers: list[int] | None = None) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    wanted = set(page_numbers or [])
    try:
        import fitz

        paths: list[Path] = []
        zoom = dpi / 72.0
        matrix = fitz.Matrix(zoom, zoom)
        with fitz.open(pdf_path) as doc:
            for idx, page in enumerate(doc, 1):
                if wanted and idx not in wanted:
                    continue
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
    paths = sorted(out_dir.glob("page-*.png"))
    if wanted:
        paths = [path for path in paths if int(re.search(r"(\d+)", path.stem).group(1)) in wanted]
    return paths


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
            return _native_text_result(payload, native_pages, ExtractionMethod.NATIVE_PDF, cfg, raw, warnings)
        if native_pages and any(text.strip() for text in native_pages):
            raw["native_pdf_pages"] = len(native_pages)
            raw["native_pdf_reliable_pages"] = [
                idx
                for idx, text in enumerate(native_pages, 1)
                if _native_pdf_page_reliable(text, cfg)
            ]
    elif file_type == "docx":
        try:
            docx_pages = _docx_text_pages(payload.data)
        except Exception as exc:
            docx_pages = []
            warnings.append(f"DOCX extraction failed: {exc}")
        if docx_pages:
            return _native_text_result(payload, docx_pages, ExtractionMethod.NATIVE_TEXT, cfg, raw, warnings)
    elif file_type == "pptx":
        try:
            pptx_pages = _pptx_text_pages(payload.data)
        except Exception as exc:
            pptx_pages = []
            warnings.append(f"PPTX extraction failed: {exc}")
        if pptx_pages:
            raw["slide_count"] = len(pptx_pages)
            raw["extracted_text_length"] = sum(len(p) for p in pptx_pages)
            log.info(
                "[ingestion] pptx_native_text file_id=%s slides=%d chars=%d",
                payload.file_id,
                len(pptx_pages),
                int(raw["extracted_text_length"]),
            )
            return _native_text_result(payload, pptx_pages, ExtractionMethod.NATIVE_TEXT, cfg, raw, warnings)

    pages: list[OCRPage] = []
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        if file_type == "pdf":
            source = tmpdir / "input.pdf"
            source.write_bytes(payload.data)
            native_by_page = {
                idx: text
                for idx, text in enumerate(native_pages, 1)
                if _native_pdf_page_reliable(text, cfg)
            } if "native_pages" in locals() else {}
            ocr_page_numbers = [
                idx
                for idx in range(1, (len(native_pages) if "native_pages" in locals() and native_pages else 0) + 1)
                if idx not in native_by_page
            ] or None
            for idx, text in native_by_page.items():
                pages.append(_page_from_native(payload.file_id, idx, text, cfg))
            image_paths = _rasterize_pdf(source, tmpdir / "rasterized", cfg.raster_dpi, ocr_page_numbers)
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
            page_number = int(re.search(r"(\d+)", image_path.stem).group(1)) if file_type == "pdf" and re.search(r"(\d+)", image_path.stem) else idx
            page, attempts = _ocr_page(
                page_number,
                image_path,
                payload.filename,
                cfg,
                artifact_writer,
                payload.output_prefix,
            )
            pages.append(page)
            all_attempts.extend({"page": page_number, **attempt} for attempt in attempts)
        raw["engine_attempts"] = all_attempts
    pages.sort(key=lambda page: page.page_number)

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
