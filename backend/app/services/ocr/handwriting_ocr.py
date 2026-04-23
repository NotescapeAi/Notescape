from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.services.ocr.schema import OCRBlock


@dataclass(slots=True)
class HandwritingOCR:
    name: str = "trocr"
    enabled: bool = False

    def extract(self, image_path: Path) -> list[OCRBlock]:
        if not self.enabled:
            return [
                OCRBlock(
                    type="handwriting",
                    bbox=None,
                    raw_text="",
                    normalized_text="",
                    confidence=0.0,
                    engine=self.name,
                    needs_review=True,
                    metadata={"skipped": "handwriting model disabled"},
                )
            ]
        try:
            from PIL import Image
            from transformers import TrOCRProcessor, VisionEncoderDecoderModel
        except Exception as exc:
            return [
                OCRBlock(
                    type="handwriting",
                    bbox=None,
                    raw_text="",
                    normalized_text="",
                    confidence=0.0,
                    engine=self.name,
                    needs_review=True,
                    metadata={"error": str(exc)[:200]},
                )
            ]
        processor = TrOCRProcessor.from_pretrained("microsoft/trocr-base-handwritten")
        model = VisionEncoderDecoderModel.from_pretrained("microsoft/trocr-base-handwritten")
        image = Image.open(image_path).convert("RGB")
        pixel_values = processor(images=image, return_tensors="pt").pixel_values
        generated_ids = model.generate(pixel_values)
        text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0].strip()
        confidence = 0.55 if text else 0.0
        return [
            OCRBlock(
                type="handwriting",
                bbox=None,
                raw_text=text,
                normalized_text=text,
                confidence=confidence,
                engine=self.name,
                needs_review=confidence < 0.68,
            )
        ]
