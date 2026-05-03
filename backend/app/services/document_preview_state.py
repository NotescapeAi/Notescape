from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Literal

from app.core.db import db_conn
from app.services.pptx_preview import converted_pdf_path, ensure_docx_preview, ensure_pptx_preview

log = logging.getLogger("uvicorn.error")

OfficeKind = Literal["pptx", "docx"]


def viewer_url(class_id: int, document_id: str) -> str:
    return f"/uploads/previews/{document_id}/converted.pdf"


def viewer_path(document_id: str) -> str:
    return str(converted_pdf_path(document_id))


async def mark_viewer_processing(document_id: str) -> None:
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE files
            SET viewer_status='processing',
                conversion_error=NULL,
                preview_error=NULL
            WHERE id=%s
            """,
            (str(document_id),),
        )
        await conn.commit()


async def sync_existing_office_preview(document_id: str, class_id: int) -> dict[str, object]:
    pdf_path = converted_pdf_path(document_id)
    pdf_ready = pdf_path.exists() and pdf_path.stat().st_size > 0
    if pdf_ready:
        url = viewer_url(class_id, document_id)
        path = str(pdf_path)
        async with db_conn() as (conn, cur):
            await cur.execute(
                """
                UPDATE files
                SET preview_key=%s,
                    preview_type='pdf',
                    preview_error=NULL,
                    viewer_file_path=%s,
                    viewer_file_url=%s,
                    viewer_file_type='pdf',
                    viewer_status='ready',
                    conversion_error=NULL
                WHERE id=%s
                """,
                (f"previews/{document_id}/converted.pdf", path, url, str(document_id)),
            )
            await conn.commit()
        log.info("[PPTX_PREVIEW] viewer_file_url = %s", url)
        log.info("[PPTX_PREVIEW] viewer_status = ready")
        log.info("[PPTX_PREVIEW] conversion_error = ")
    return {
        "document_id": document_id,
        "viewer_status": "ready" if pdf_ready else "missing",
        "viewer_file_url": viewer_url(class_id, document_id) if pdf_ready else None,
        "viewer_file_path": str(pdf_path) if pdf_ready else None,
        "viewer_file_type": "pdf" if pdf_ready else None,
        "conversion_error": None,
        "preview_ready": pdf_ready,
        "pdf_url": viewer_url(class_id, document_id) if pdf_ready else None,
    }


async def generate_office_preview(
    *,
    document_id: str,
    class_id: int,
    data: bytes,
    kind: OfficeKind,
    original_file_path: str | None = None,
    timeout_seconds: int = 120,
) -> dict[str, object]:
    await mark_viewer_processing(document_id)
    if kind == "pptx":
        _slides, error = await asyncio.to_thread(
            ensure_pptx_preview,
            data,
            document_id,
            timeout_seconds=timeout_seconds,
            original_file_path=original_file_path,
        )
    else:
        _slides, error = await asyncio.to_thread(
            ensure_docx_preview,
            data,
            document_id,
            timeout_seconds=timeout_seconds,
            original_file_path=original_file_path,
        )

    pdf_path = converted_pdf_path(document_id)
    pdf_ready = pdf_path.exists() and pdf_path.stat().st_size > 0
    url = viewer_url(class_id, document_id) if pdf_ready else None
    path = str(pdf_path) if pdf_ready else None
    status = "ready" if pdf_ready else "failed"
    conversion_error = None if pdf_ready else (error or "Preview PDF was not generated.")

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE files
            SET preview_key=%s,
                preview_error=%s,
                preview_type=%s,
                viewer_file_path=%s,
                viewer_file_url=%s,
                viewer_file_type=%s,
                viewer_status=%s,
                conversion_error=%s
            WHERE id=%s AND class_id=%s
            """,
            (
                f"previews/{document_id}/converted.pdf" if pdf_ready else None,
                conversion_error,
                "pdf" if pdf_ready else None,
                path,
                url,
                "pdf" if pdf_ready else None,
                status,
                conversion_error,
                str(document_id),
                int(class_id),
            ),
        )
        await conn.commit()

    log.info("[PPTX_PREVIEW] pdf_exists = %s", pdf_ready)
    log.info("[PPTX_PREVIEW] pdf_size = %s", pdf_path.stat().st_size if pdf_ready else 0)
    log.info("[PPTX_PREVIEW] viewer_file_url = %s", url)
    log.info("[PPTX_PREVIEW] viewer_status = %s", status)
    log.info("[PPTX_PREVIEW] conversion_error = %s", conversion_error or "")

    return {
        "document_id": document_id,
        "viewer_status": status,
        "viewer_file_url": url,
        "viewer_file_path": path,
        "viewer_file_type": "pdf" if pdf_ready else None,
        "conversion_error": conversion_error,
        "preview_ready": pdf_ready,
        "preview_error": conversion_error,
        "pdf_url": url,
    }

