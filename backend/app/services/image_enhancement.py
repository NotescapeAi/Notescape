from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable


@dataclass(slots=True)
class EnhancementVariant:
    name: str
    path: Path
    metrics: dict[str, float | int | str]


def _copy_variant(src: Path, dst: Path) -> None:
    dst.write_bytes(src.read_bytes())


def build_enhancement_variants(image_path: Path, output_dir: Path) -> list[EnhancementVariant]:
    output_dir.mkdir(parents=True, exist_ok=True)
    variants: list[EnhancementVariant] = []
    original = output_dir / f"{image_path.stem}-original{image_path.suffix}"
    _copy_variant(image_path, original)
    variants.append(EnhancementVariant("original", original, {"strategy": "none"}))

    try:
        import cv2
        import numpy as np

        img = cv2.imread(str(image_path))
        if img is None:
            return variants
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        def save(name: str, arr, metrics: dict[str, float | int | str]) -> None:
            path = output_dir / f"{image_path.stem}-{name}.png"
            cv2.imwrite(str(path), arr)
            variants.append(EnhancementVariant(name, path, metrics))

        denoised = cv2.fastNlMeansDenoising(gray, None, 18, 7, 21)
        save("gray-denoise", denoised, {"strategy": "grayscale+denoise"})

        clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8)).apply(gray)
        save("contrast", clahe, {"strategy": "grayscale+clahe"})

        thresh = cv2.adaptiveThreshold(
            clahe,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            12,
        )
        save("adaptive-threshold", thresh, {"strategy": "clahe+adaptive_threshold"})

        kernel = np.ones((2, 2), np.uint8)
        morph = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        save("stroke-continuity", morph, {"strategy": "threshold+morph_close"})

        upscaled = cv2.resize(clahe, None, fx=1.6, fy=1.6, interpolation=cv2.INTER_CUBIC)
        sharpen_kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
        sharp = cv2.filter2D(upscaled, -1, sharpen_kernel)
        save("upscale-sharpen", sharp, {"strategy": "clahe+upscale+sharpen", "scale": 1.6})
    except Exception as exc:
        variants.append(
            EnhancementVariant(
                "enhancement-unavailable",
                original,
                {"strategy": "none", "error": str(exc)[:200]},
            )
        )
    return variants
