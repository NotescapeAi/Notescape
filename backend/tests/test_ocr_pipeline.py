from pathlib import Path

from app.services.document_ingestion import ExtractionInput, _native_pdf_reliable, extract_document
from app.services.ocr.config import OCRConfig
from app.services.ocr.postprocess import postprocess_block
from app.services.ocr.schema import OCRBlock
from app.services.page_router import classify_page, route_regions
from app.services.flashcards.source_builder import build_flashcard_source_pages


def test_native_pdf_reliability_accepts_clean_text():
    cfg = OCRConfig(native_pdf_min_chars_per_page=20)
    pages = ["Definition of a matrix and vector spaces. " * 4]
    assert _native_pdf_reliable(pages, cfg) is True


def test_native_pdf_reliability_rejects_sparse_or_corrupt_text():
    cfg = OCRConfig(native_pdf_min_chars_per_page=80)
    assert _native_pdf_reliable(["   ", "\x00\x01\x02"], cfg) is False
    assert _native_pdf_reliable(["short"], cfg) is False


def test_router_detects_formula_heavy_and_mixed_pages():
    formula_page = "For a quadratic equation ax^2 + bx + c = 0, x = (-b +- sqrt(b^2 - 4ac)) / 2a."
    assert classify_page(formula_page, average_confidence=0.85) == "formula_heavy_page"
    regions = route_regions(formula_page, "formula_heavy_page", 100, 200)
    assert any(r.type == "formula" for r in regions)


def test_postprocess_is_conservative_and_auditable():
    cfg = OCRConfig(domain_lexicon={"black"}, protected_vocabulary={"api"})
    block = OCRBlock(
        type="text",
        bbox=None,
        raw_text="The bleck API value is x_1 and https://example.com stays.",
        normalized_text="The bleck API value is x_1 and https://example.com stays.",
        confidence=0.52,
        engine="test",
    )
    out = postprocess_block(block, cfg)
    assert "black API" in out.normalized_text
    assert "x_1" in out.normalized_text
    assert "https://example.com" in out.normalized_text
    assert out.corrections[0].original == "bleck"


def test_flashcard_source_filters_low_confidence_garbage_and_keeps_formula():
    cfg = OCRConfig(flashcard_min_block_confidence=0.58, flashcard_min_page_score=0.1)
    from app.services.ocr.schema import OCRPage, PageMetrics

    page = OCRPage(
        page_number=1,
        page_type="mixed_page",
        blocks=[
            OCRBlock("text", None, "asdf ### qqq", "asdf ### qqq", 0.2, "test", needs_review=True),
            OCRBlock("text", None, "A vector has magnitude and direction.", "A vector has magnitude and direction.", 0.91, "test"),
            OCRBlock("formula", None, "E=mc^2", "E=mc^2", 0.45, "formula", latex="$E=mc^2$", needs_review=True),
        ],
        metrics=PageMetrics(flashcard_eligibility_score=0.8),
    )
    source = build_flashcard_source_pages([page], cfg)[0]
    assert "asdf" not in source
    assert "A vector" in source
    assert "$E=mc^2$" in source


def test_image_document_routes_handwriting_filename_without_model(monkeypatch, tmp_path):
    from PIL import Image

    image_path = tmp_path / "handwritten.png"
    Image.new("RGB", (80, 40), "white").save(image_path)

    def fake_variants(path: Path, output_dir: Path):
        from app.services.image_enhancement import EnhancementVariant

        return [EnhancementVariant("original", path, {"strategy": "test"})]

    class FakePrinted:
        name = "fake"

        def extract(self, image_path: Path):
            return [
                OCRBlock(
                    "text",
                    None,
                    "low confidence handwritten looking note",
                    "low confidence handwritten looking note",
                    0.5,
                    "fake",
                    needs_review=True,
                )
            ]

    monkeypatch.setattr("app.services.document_ingestion.build_enhancement_variants", fake_variants)
    monkeypatch.setattr("app.services.document_ingestion._select_printed_engine", lambda cfg: FakePrinted())
    result = extract_document(
        ExtractionInput(
            file_id="file-1",
            filename="handwritten-notes.png",
            mime_type="image/png",
            data=image_path.read_bytes(),
        ),
        config=OCRConfig(enable_trocr=False),
    )
    assert result.method.value == "ocr"
    assert result.pages[0].page_type == "handwritten_page"
    assert any(block.type == "handwriting" for block in result.pages[0].blocks)


def test_formula_region_preserves_latex_from_text_hint(monkeypatch, tmp_path):
    from PIL import Image

    image_path = tmp_path / "formula.png"
    Image.new("RGB", (80, 40), "white").save(image_path)

    def fake_variants(path: Path, output_dir: Path):
        from app.services.image_enhancement import EnhancementVariant

        return [EnhancementVariant("original", path, {"strategy": "test"})]

    class FakePrinted:
        name = "fake"

        def extract(self, image_path: Path):
            return [OCRBlock("text", None, "Newton law: F = m a", "Newton law: F = m a", 0.88, "fake")]

    monkeypatch.setattr("app.services.document_ingestion.build_enhancement_variants", fake_variants)
    monkeypatch.setattr("app.services.document_ingestion._select_printed_engine", lambda cfg: FakePrinted())
    result = extract_document(
        ExtractionInput(
            file_id="file-2",
            filename="physics.png",
            mime_type="image/png",
            data=image_path.read_bytes(),
        ),
        config=OCRConfig(enable_formula_ocr=False),
    )
    assert result.pages[0].page_type in {"mixed_page", "formula_heavy_page"}
    assert "$F = m a$" in result.markdown
