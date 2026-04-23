from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re

from app.services.ocr.schema import OCRBlock

_SIMPLE_EQUATION_RE = re.compile(r"([A-Za-z0-9_{}\\^+\-*/(). ]+\s*=\s*[A-Za-z0-9_{}\\^+\-*/(). ]+)")


@dataclass(slots=True)
class FormulaOCR:
    name: str = "pix2tex"
    enabled: bool = False

    def extract(self, image_path: Path, text_hint: str = "") -> list[OCRBlock]:
        if self.enabled:
            try:
                from pix2tex.cli import LatexOCR
                from PIL import Image

                model = LatexOCR()
                latex = (model(Image.open(image_path)) or "").strip()
                return [
                    OCRBlock(
                        type="formula",
                        bbox=None,
                        raw_text=latex,
                        normalized_text=latex,
                        latex=latex,
                        confidence=0.62 if latex else 0.0,
                        engine=self.name,
                        needs_review=not latex,
                    )
                ]
            except Exception as exc:
                return [
                    OCRBlock(
                        type="formula",
                        bbox=None,
                        raw_text="",
                        normalized_text="",
                        latex=None,
                        confidence=0.0,
                        engine=self.name,
                        needs_review=True,
                        metadata={"error": str(exc)[:200]},
                    )
                ]
        match = _SIMPLE_EQUATION_RE.search(text_hint or "")
        if not match:
            return [
                OCRBlock(
                    type="formula",
                    bbox=None,
                    raw_text="",
                    normalized_text="",
                    latex=None,
                    confidence=0.0,
                    engine=self.name,
                    needs_review=True,
                    metadata={"skipped": "formula OCR disabled and no text equation hint found"},
                )
            ]
        latex = match.group(1).strip()
        return [
            OCRBlock(
                type="formula",
                bbox=None,
                raw_text=latex,
                normalized_text=latex,
                latex=f"${latex}$",
                confidence=0.52,
                engine="formula-regex-fallback",
                needs_review=True,
                metadata={"fallback": "regex text hint"},
            )
        ]
