from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from app.core.settings import settings
from app.services.ocr.config import OCRConfig, load_ocr_config
from app.services.ocr.handwriting_ocr import HandwritingOCR
from app.services.ocr.printed_ocr import PaddlePrintedOCR, TesseractPrintedOCR
from app.services.ocr.schema import OCRBlock


class OCRProvider(Protocol):
    name: str
    supports_math: bool
    supports_handwriting: bool

    def extract_from_image(self, image_path: Path) -> list[OCRBlock]:
        ...


@dataclass(slots=True)
class LocalOCRProvider:
    config: OCRConfig
    name: str = "local"
    supports_math: bool = False
    supports_handwriting: bool = True

    def extract_from_image(self, image_path: Path) -> list[OCRBlock]:
        blocks: list[OCRBlock] = []
        if self.config.enable_paddleocr:
            blocks.extend(PaddlePrintedOCR().extract(image_path))
        else:
            blocks.extend(TesseractPrintedOCR().extract(image_path))
        if self.config.enable_trocr:
            blocks.extend(HandwritingOCR(enabled=True).extract(image_path))
        return blocks


@dataclass(slots=True)
class PlaceholderCloudOCRProvider:
    name: str
    supports_math: bool
    supports_handwriting: bool = True

    def extract_from_image(self, image_path: Path) -> list[OCRBlock]:
        raise RuntimeError(
            f"{self.name} OCR is selected, but this deployment does not include its client adapter yet."
        )


def get_ocr_provider(config: OCRConfig | None = None) -> OCRProvider:
    cfg = config or load_ocr_config()
    provider = (settings.ocr_provider or "local").strip().lower()
    if provider in {"google_vision", "google"} and settings.google_application_credentials:
        return PlaceholderCloudOCRProvider("google_vision", supports_math=False)
    if provider in {"azure", "azure_document_intelligence"} and settings.azure_document_intelligence_endpoint and settings.azure_document_intelligence_key:
        return PlaceholderCloudOCRProvider("azure_document_intelligence", supports_math=True)
    if provider == "mathpix" and settings.mathpix_app_id and settings.mathpix_app_key:
        return PlaceholderCloudOCRProvider("mathpix", supports_math=True)
    return LocalOCRProvider(cfg)


def ocr_provider_status() -> dict[str, object]:
    selected = (settings.ocr_provider or "local").strip().lower()
    configured = {
        "google_vision": bool(settings.google_application_credentials),
        "azure_document_intelligence": bool(settings.azure_document_intelligence_endpoint and settings.azure_document_intelligence_key),
        "mathpix": bool(settings.mathpix_app_id and settings.mathpix_app_key),
        "local": True,
    }
    active = get_ocr_provider()
    return {
        "selected": selected,
        "active": active.name,
        "enabled": bool(settings.ocr_handwritten_enabled),
        "configured": configured,
        "supports_math": active.supports_math,
        "supports_handwriting": active.supports_handwriting,
    }
