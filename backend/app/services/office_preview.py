"""LibreOffice headless conversion of PPTX/DOCX to PDF for in-app preview."""

from __future__ import annotations

import logging
import shlex
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from app.core.settings import settings

log = logging.getLogger("uvicorn.error")

_OFFICE_EXT = frozenset({".pptx", ".docx"})


def libreoffice_executable() -> str | None:
    return shutil.which("soffice") or shutil.which("libreoffice")


def libreoffice_version() -> str | None:
    office = libreoffice_executable()
    if not office:
        return None
    try:
        result = subprocess.run(
            [office, "--headless", "--version"],
            check=True,
            capture_output=True,
            timeout=10,
        )
    except Exception:
        return None
    return (result.stdout or result.stderr or b"").decode("utf-8", errors="replace").strip() or None


def preview_root() -> Path:
    return (Path(settings.upload_root).resolve() / "previews")


def preview_dir(document_id: str) -> Path:
    return (preview_root() / document_id).resolve()


def converted_pdf_path(document_id: str) -> Path:
    return preview_dir(document_id) / "converted.pdf"


def existing_slide_assets(document_id: str) -> list[Path]:
    return sorted(preview_dir(document_id).glob("slide_*.png"))


def office_preview_status() -> tuple[bool, str | None]:
    version = libreoffice_version()
    return bool(version), version


def log_office_preview_status() -> None:
    office = libreoffice_executable()
    enabled, version = office_preview_status()
    log.info("[PREVIEW] LibreOffice detected: %s", str(enabled).lower())
    log.info("[PREVIEW] LibreOffice path: %s", office or "")
    log.info("[PREVIEW] LibreOffice version: %s", version or "")
    if enabled:
        log.info("Office document preview (LibreOffice): enabled (%s)", version)
    else:
        log.warning("Office document preview (LibreOffice): disabled — soffice/libreoffice not on PATH")


def _normalize_ext(source_extension: str) -> str:
    ext = (source_extension or "").lower().strip()
    if not ext.startswith("."):
        ext = f".{ext}"
    if ext not in _OFFICE_EXT:
        raise ValueError(f"Unsupported office extension for PDF preview: {source_extension!r}")
    return ext


def ensure_office_pdf_preview(
    file_bytes: bytes,
    document_id: str,
    *,
    source_extension: str,
    timeout_seconds: int = 120,
    generate_slide_pngs: bool = False,
    original_file_path: str | None = None,
) -> tuple[list[Path], str | None]:
    """Convert PPTX or DOCX bytes to ``previews/{document_id}/converted.pdf``.

    Returns ``(slide_png_paths, error)``. On success, ``error`` is ``None`` and the PDF exists.
    Slide PNG generation is optional (PPTX only) and failures do not fail the conversion if PDF exists.
    """
    ext = _normalize_ext(source_extension)
    out_dir = preview_dir(document_id)
    out_dir.mkdir(parents=True, exist_ok=True)

    pdf_dest = converted_pdf_path(document_id)
    if pdf_dest.exists() and pdf_dest.stat().st_size > 0:
        log.info("[office_preview] cache hit document_id=%s pdf_bytes=%s", document_id, pdf_dest.stat().st_size)
        return existing_slide_assets(document_id), None

    stale_slides = existing_slide_assets(document_id)
    for p in stale_slides:
        try:
            p.unlink(missing_ok=True)
        except Exception:
            pass

    office = libreoffice_executable()
    original_exists = bool(original_file_path and Path(original_file_path).exists())
    original_size = Path(original_file_path).stat().st_size if original_exists and original_file_path else len(file_bytes)
    log.info("[PPTX_PREVIEW] document_id = %s", document_id)
    log.info("[PPTX_PREVIEW] original_file_path = %s", original_file_path or "<bytes>")
    log.info("[PPTX_PREVIEW] original_exists = %s", original_exists or bool(file_bytes))
    log.info("[PPTX_PREVIEW] original_size = %s", original_size)
    log.info("[PPTX_PREVIEW] output_dir = %s", out_dir)
    log.info("[PPTX_PREVIEW] expected_pdf_path = %s", pdf_dest)
    log.info("[PPTX_PREVIEW] converter = %s", office)
    if not office:
        return [], "LibreOffice is not installed or not on PATH, so document preview conversion is unavailable."

    started = time.perf_counter()
    input_name = f"input{ext}"

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        source = tmpdir / input_name
        source.write_bytes(file_bytes)

        cmd = [
            office,
            "--headless",
            "--nologo",
            "--nofirststartwizard",
            "--convert-to",
            "pdf",
            "--outdir",
            str(tmpdir),
            str(source),
        ]
        tmp_expected_pdf = tmpdir / f"{source.stem}.pdf"
        log.info("[PPTX_PREVIEW] command = %s", " ".join(shlex.quote(part) for part in cmd))
        log.info(
            "[office_preview] conversion_start document_id=%s ext=%s cmd=%s",
            document_id,
            ext,
            " ".join(cmd[:6]) + f" ... {source.name!r}",
        )
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=timeout_seconds,
            )
            stdout = (result.stdout or b"").decode("utf-8", errors="replace").strip()
            stderr = (result.stderr or b"").decode("utf-8", errors="replace").strip()
            log.info("[PPTX_PREVIEW] stdout = %s", stdout)
            log.info("[PPTX_PREVIEW] stderr = %s", stderr)
            log.info("[PPTX_PREVIEW] return_code = %s", result.returncode)
            if result.returncode != 0:
                detail = stderr or stdout or f"LibreOffice exited with code {result.returncode}."
                log.warning(
                    "[office_preview] conversion_failed document_id=%s ext=%s detail=%s",
                    document_id,
                    ext,
                    detail[:800],
                )
                return [], detail
        except subprocess.TimeoutExpired:
            log.warning("[PPTX_PREVIEW] return_code = timeout")
            return [], "Document preview conversion timed out."

        stem = source.stem
        pdf_path = tmpdir / f"{stem}.pdf"
        log.info("[PPTX_PREVIEW] expected_pdf_path = %s", tmp_expected_pdf)
        if not pdf_path.exists():
            converted = list(tmpdir.glob("*.pdf"))
            pdf_path = converted[0] if converted else pdf_path
        log.info("[PPTX_PREVIEW] pdf_exists = %s", pdf_path.exists())
        log.info("[PPTX_PREVIEW] pdf_size = %s", pdf_path.stat().st_size if pdf_path.exists() else 0)
        if not pdf_path.exists() or pdf_path.stat().st_size == 0:
            return [], "Conversion did not produce a PDF."

        pdf_dest.write_bytes(pdf_path.read_bytes())
        log.info(
            "[office_preview] pdf_written document_id=%s ext=%s bytes=%d elapsed_ms=%d",
            document_id,
            ext,
            pdf_dest.stat().st_size,
            int((time.perf_counter() - started) * 1000),
        )

        image_paths: list[Path] = []
        if generate_slide_pngs and ext == ".pptx":
            try:
                import fitz  # PyMuPDF

                with fitz.open(pdf_path) as doc:
                    for idx, page in enumerate(doc, 1):
                        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                        out = out_dir / f"slide_{idx:03d}.png"
                        pix.save(out)
                        image_paths.append(out)
            except Exception as exc:
                pdftoppm = shutil.which("pdftoppm")
                if pdftoppm:
                    try:
                        prefix = out_dir / "slide"
                        subprocess.run(
                            [pdftoppm, "-png", "-r", "144", str(pdf_path), str(prefix)],
                            check=True,
                            capture_output=True,
                            timeout=timeout_seconds,
                        )
                        generated = sorted(out_dir.glob("slide-*.png"))
                        for idx, path in enumerate(generated, 1):
                            normalized = out_dir / f"slide_{idx:03d}.png"
                            path.replace(normalized)
                            image_paths.append(normalized)
                    except Exception as render_exc:
                        log.warning(
                            "[office_preview] optional_slide_png_failed document_id=%s err=%s",
                            document_id,
                            render_exc,
                        )
                else:
                    log.warning(
                        "[office_preview] optional_slide_png_failed document_id=%s err=%s",
                        document_id,
                        exc,
                    )

    return image_paths, None
