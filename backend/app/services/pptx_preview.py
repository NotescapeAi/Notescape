"""PPTX/DOCX → PDF preview paths (delegates to :mod:`app.services.office_preview`)."""

from __future__ import annotations

from pathlib import Path

from app.services.office_preview import (
    converted_pdf_path,
    ensure_office_pdf_preview,
    existing_slide_assets,
    libreoffice_executable,
    libreoffice_version,
    log_office_preview_status,
    office_preview_status,
    preview_dir,
    preview_root,
)


def pptx_preview_status() -> tuple[bool, str | None]:
    return office_preview_status()


def log_pptx_preview_status() -> None:
    log_office_preview_status()


def ensure_pptx_preview(
    pptx_bytes: bytes,
    document_id: str,
    *,
    timeout_seconds: int = 120,
    original_file_path: str | None = None,
) -> tuple[list[Path], str | None]:
    return ensure_office_pdf_preview(
        pptx_bytes,
        document_id,
        source_extension=".pptx",
        timeout_seconds=timeout_seconds,
        generate_slide_pngs=False,
        original_file_path=original_file_path,
    )


def ensure_docx_preview(
    docx_bytes: bytes,
    document_id: str,
    *,
    timeout_seconds: int = 120,
    original_file_path: str | None = None,
) -> tuple[list[Path], str | None]:
    return ensure_office_pdf_preview(
        docx_bytes,
        document_id,
        source_extension=".docx",
        timeout_seconds=timeout_seconds,
        generate_slide_pngs=False,
        original_file_path=original_file_path,
    )
