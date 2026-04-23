from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import subprocess
from typing import Protocol

from app.services.ocr.schema import BoundingBox, OCRBlock


class PrintedOCREngine(Protocol):
    name: str

    def extract(self, image_path: Path) -> list[OCRBlock]:
        ...


@dataclass(slots=True)
class TesseractPrintedOCR:
    name: str = "tesseract"

    def extract(self, image_path: Path) -> list[OCRBlock]:
        try:
            proc = subprocess.run(
                ["tesseract", str(image_path), "stdout", "--psm", "6"],
                check=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="ignore",
            )
            text = (proc.stdout or "").strip()
            confidence = 0.62 if text else 0.0
            if proc.returncode != 0:
                confidence = 0.0
            return [
                OCRBlock(
                    type="text",
                    bbox=None,
                    raw_text=text,
                    normalized_text=text,
                    confidence=confidence,
                    engine=self.name,
                    needs_review=confidence < 0.55,
                )
            ]
        except FileNotFoundError:
            return [
                OCRBlock(
                    type="unknown",
                    bbox=None,
                    raw_text="",
                    normalized_text="",
                    confidence=0.0,
                    engine=self.name,
                    needs_review=True,
                    metadata={"error": "tesseract executable not found"},
                )
            ]


@dataclass(slots=True)
class PaddlePrintedOCR:
    name: str = "paddleocr"

    def extract(self, image_path: Path) -> list[OCRBlock]:
        try:
            from paddleocr import PaddleOCR
        except Exception as exc:
            return TesseractPrintedOCR().extract(image_path) + [
                OCRBlock(
                    type="unknown",
                    bbox=None,
                    raw_text="",
                    normalized_text="",
                    confidence=0.0,
                    engine=self.name,
                    needs_review=True,
                    metadata={"fallback": "tesseract", "error": str(exc)[:200]},
                )
            ]
        ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
        result = ocr.ocr(str(image_path), cls=True) or []
        blocks: list[OCRBlock] = []
        order = 0
        for page in result:
            for item in page or []:
                points, payload = item
                text, conf = payload
                xs = [p[0] for p in points]
                ys = [p[1] for p in points]
                blocks.append(
                    OCRBlock(
                        type="text",
                        bbox=BoundingBox(min(xs), min(ys), max(xs), max(ys)),
                        raw_text=text or "",
                        normalized_text=text or "",
                        confidence=float(conf or 0.0),
                        engine=self.name,
                        needs_review=float(conf or 0.0) < 0.6,
                        reading_order=order,
                    )
                )
                order += 1
        return blocks
