# OCR Pipeline

NoteScape now routes uploaded PDFs and images through a structured, confidence-aware extraction pipeline before indexing content for flashcards.

## Architecture

Upload creates an async `ocr_jobs` row for PDFs and common image formats. The worker calls `app.services.document_ingestion.extract_document`, which:

1. Detects file type.
2. Tries native PDF text extraction first.
3. Falls back to page rasterization when native text is sparse, corrupt, or empty.
4. Builds multiple image enhancement variants.
5. Runs printed OCR, handwriting OCR, and formula OCR according to page/region routing.
6. Applies conservative post-processing.
7. Emits structured JSON, Markdown, metrics, raw attempts, and correction logs.
8. Indexes only flashcard-safe Markdown blocks.

Key modules:

- `app/services/document_ingestion.py`
- `app/services/page_router.py`
- `app/services/image_enhancement.py`
- `app/services/ocr/printed_ocr.py`
- `app/services/ocr/handwriting_ocr.py`
- `app/services/ocr/formula_ocr.py`
- `app/services/ocr/postprocess.py`
- `app/services/ocr/normalize.py`
- `app/services/flashcards/source_builder.py`
- `app/workers/ocr_worker.py`

## Thresholds

Thresholds are configured through environment variables:

- `OCR_NATIVE_MIN_CHARS_PER_PAGE`, default `200`
- `OCR_NATIVE_MIN_PRINTABLE_RATIO`, default `0.92`
- `OCR_REVIEW_BLOCK_CONFIDENCE`, default `0.68`
- `OCR_FLASHCARD_MIN_BLOCK_CONFIDENCE`, default `0.58`
- `OCR_FLASHCARD_MIN_PAGE_SCORE`, default `0.45`
- `OCR_MAX_CORRECTION_EDIT_DISTANCE`, default `2`
- `OCR_DOMAIN_LEXICON`, comma-separated course terms
- `OCR_PROTECTED_VOCABULARY`, comma-separated terms that must not be autocorrected

Low-confidence blocks are kept in the normalized JSON for debugging, but skipped or down-ranked in flashcard source text.

## Backend Toggles

Large OCR models are optional. The service degrades gracefully if they are disabled or unavailable.

- `OCR_ENABLE_PADDLEOCR=true` enables PaddleOCR for printed/scanned text.
- `OCR_ENABLE_TROCR=true` enables TrOCR handwriting recognition.
- `OCR_ENABLE_FORMULA_OCR=true` enables formula OCR through the configured formula backend.
- `OCR_FORMULA_ENGINE=pix2tex` labels the formula backend.

When disabled, printed OCR falls back to Tesseract, handwriting regions are marked for review, and simple formula hints are preserved from text when possible.

## Stored Artifacts

Each job stores:

- `ocr/normalized.json`
- `ocr/markdown.md`
- `ocr/raw.json`
- `ocr/metrics.json`
- `ocr/corrections.json`
- `pages/page-0001/original.png`
- `pages/page-0001/enhanced/*.png`

`ocr_jobs` has additional keys for raw JSON, metrics, and correction logs. Run `db/init/20_ocr_pipeline.sql` or let app startup/worker startup apply it.

## Flashcard Safety

The flashcard generator consumes indexed chunks created by `build_flashcard_source_pages`. This keeps equations, skips unreadable regions, and avoids turning low-confidence OCR garbage into cards. Raw OCR remains available for audit and future reprocessing.
