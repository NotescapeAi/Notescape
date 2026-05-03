import asyncio
import json
import logging
import time
from pathlib import Path, PurePosixPath
from typing import Any

from app.core.cache import cache_set
from app.core.db import db_conn
from app.core.migrations import ensure_ocr_pipeline_schema
from app.core.settings import settings
from app.core.storage import get_object_bytes, put_bytes
from app.lib.indexing import build_deduped_chunks, persist_chunk_embeddings
from app.services.document_preview_state import generate_office_preview
from app.services.document_ingestion import ExtractionInput, extract_document, result_json_bytes
from app.services.flashcards.source_builder import build_flashcard_source_pages
from app.lib.stored_document_paths import resolve_local_original_file

POLL_SECONDS = 2
# Mark uploads stuck in non-terminal states as failed (even if worker died).
_STUCK_PROCESSING_MINUTES = 45
_JOB_PROCESSING_TIMEOUT = 1800.0  # seconds; full job guard (large PDFs / slow OCR)
log = logging.getLogger("uvicorn.error")
_stuck_recovery_counter = 0


async def recover_stuck_documents() -> int:
    """Fail typed documents left in intermediate states (crashed worker, hung conversion, etc.)."""
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE files
            SET status = 'FAILED',
                last_error = 'Processing exceeded the time limit with no saved index. Try "Retry processing".',
                processing_progress = 100
            WHERE indexed_at IS NULL
              AND uploaded_at < (now() - (%s * interval '1 minute'))
              AND COALESCE(source_type, 'document') = 'document'
              AND status IN (
                'PROCESSING', 'OCR_QUEUED', 'EXTRACTING_TEXT', 'CHUNKING', 'GENERATING_EMBEDDINGS',
                'CONVERTING_PREVIEW', 'PREVIEW_READY', 'FAILED_PREVIEW', 'OCR_DONE', 'RUNNING_OCR',
                'SPLITTING_PAGES', 'ENHANCING_IMAGE', 'PREPARING_REVIEW', 'UPLOADED'
              )
            """,
            (_STUCK_PROCESSING_MINUTES,),
        )
        n = cur.rowcount if cur.rowcount is not None else 0
        await conn.commit()
    return int(n)


async def fetch_and_claim_job() -> dict[str, Any] | None:
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE ocr_jobs
            SET status='running', started_at=now()
            WHERE id = (
            SELECT id FROM ocr_jobs
                WHERE status='queued'
                   OR (
                       status='running'
                       AND finished_at IS NULL
                       AND started_at < now() - interval '15 minutes'
                   )
                ORDER BY created_at
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING id::text, file_id::text, output_text_key, output_json_key, engine
            """
        )
        row = await cur.fetchone()
        if row:
            await conn.commit()
            cols = [d[0] for d in cur.description]
            return dict(zip(cols, row))
    return None


async def get_file_info(file_id: str) -> dict[str, Any] | None:
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT files.storage_key,
                   files.storage_url,
                   files.mime_type,
                   files.filename,
                   files.storage_backend,
                   files.class_id,
                   files.id::text AS file_id,
                   classes.owner_uid
            FROM files
            JOIN classes ON classes.id = files.class_id
            WHERE files.id=%s
            """,
            (str(file_id),),
        )
        row = await cur.fetchone()
        if not row:
            return None
        cols = [d[0] for d in cur.description]
        out = dict(zip(cols, row))
        # Some drivers normalize alias casing; ensure id is always present for path resolution.
        if "file_id" not in out and "id" in out:
            out["file_id"] = out["id"]
        return out


def _read_file_bytes(info: dict[str, Any], *, file_id: str | None = None) -> bytes:
    storage_key = info.get("storage_key")
    storage_url = info.get("storage_url")
    backend = (info.get("storage_backend") or settings.storage_backend).lower()
    if backend == "local":
        upload_root = Path(settings.upload_root).resolve()
        fid = str(info.get("file_id") or file_id or "")
        class_id = int(info["class_id"])
        path, _rel = resolve_local_original_file(
            upload_root,
            class_id,
            fid,
            str(storage_key) if storage_key else None,
            str(storage_url) if storage_url else None,
            hint_display_filename=str(info.get("filename") or ""),
            context="ocr_worker",
        )
        if not path:
            raise RuntimeError("File not found on disk for local storage")
        return path.read_bytes()
    if not storage_key:
        raise RuntimeError("File has no storage key")
    return get_object_bytes(str(storage_key))


def _write_bytes(key: str, data: bytes, content_type: str, storage_backend: str) -> str:
    if storage_backend.lower() == "local":
        path = _local_path_for_key(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key
    put_bytes(key, data, content_type)
    return key


def _make_artifact_writer(output_prefix: str, storage_backend: str):
    def writer(name: str, data: bytes, content_type: str) -> str:
        key = f"{output_prefix.rstrip('/')}/{name.lstrip('/')}"
        return _write_bytes(key, data, content_type, storage_backend)

    return writer


async def update_file_status(file_id: str, status: str, error: str | None = None, indexed: bool = False):
    progress = {
        "UPLOADED": 10,
        "PROCESSING": 20,
        "SPLITTING_PAGES": 25,
        "ENHANCING_IMAGE": 30,
        "EXTRACTING_TEXT": 35,
        "CHUNKING": 62,
        "RUNNING_OCR": 45,
        "PREPARING_REVIEW": 70,
        "OCR_NEEDS_REVIEW": 90,
        "OCR_READY": 100,
        "CONVERTING_PREVIEW": 50,
        "PREVIEW_READY": 65,
        "FAILED_PREVIEW": 65,
        "OCR_QUEUED": 35,
        "GENERATING_EMBEDDINGS": 75,
        "OCR_DONE": 85,
        "INDEXED": 100,
        "READY": 100,
        "FAILED": 100,
    }.get(status.upper(), 0)
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE files
            SET status=%s,
                last_error=%s,
                processing_progress=%s,
                indexed_at=CASE WHEN %s THEN now() ELSE indexed_at END
            WHERE id=%s
            """,
            (status, error, progress, indexed, str(file_id)),
        )
        await conn.commit()


def _page_lines(page) -> list[dict[str, object]]:
    lines: list[dict[str, object]] = []
    for block in page.blocks:
        text = block.display_text()
        if not text.strip():
            continue
        lines.append(
            {
                "text": text,
                "confidence": round(float(block.confidence or 0.0), 4),
                "bbox": block.bbox.as_list() if block.bbox else None,
                "type": block.type,
                "engine": block.engine,
                "needs_review": bool(block.needs_review),
            }
        )
    return lines


async def _store_handwritten_review_pages(file_id: str, info: dict[str, Any], result) -> None:
    user_id = str(info["owner_uid"])
    class_id = int(info["class_id"])
    provider = str(result.raw.get("provider") or result.raw.get("engine") or "local")
    if provider in {"ocr", "mixed", "partial", "native_pdf", "native_text"}:
        provider = "local"
    async with db_conn() as (conn, cur):
        await cur.execute("DELETE FROM handwritten_ocr_pages WHERE file_id=%s", (file_id,))
        for page in result.pages:
            raw_text = "\n".join(line["text"] for line in _page_lines(page)).strip()
            cleaned_text = page.markdown.strip() or raw_text
            warnings = list(page.warnings or [])
            if page.metrics.ocr_confidence < 0.68:
                warnings.append("low_confidence")
            if page.page_type == "formula_heavy_page" or any(str(b.type) == "formula" for b in page.blocks):
                warnings.append("possible_math_detected")
            await cur.execute(
                """
                INSERT INTO handwritten_ocr_pages
                  (user_id, class_id, file_id, page_number, raw_text, cleaned_text,
                   confidence, lines, warnings, provider, original_image_key, processed_image_keys)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s, %s::jsonb)
                ON CONFLICT (file_id, page_number)
                DO UPDATE SET
                  raw_text=EXCLUDED.raw_text,
                  cleaned_text=EXCLUDED.cleaned_text,
                  confidence=EXCLUDED.confidence,
                  lines=EXCLUDED.lines,
                  warnings=EXCLUDED.warnings,
                  provider=EXCLUDED.provider,
                  original_image_key=EXCLUDED.original_image_key,
                  processed_image_keys=EXCLUDED.processed_image_keys,
                  reviewed=FALSE,
                  updated_at=now()
                """,
                (
                    user_id,
                    class_id,
                    file_id,
                    page.page_number,
                    raw_text,
                    cleaned_text,
                    float(page.metrics.ocr_confidence or 0.0),
                    json.dumps(_page_lines(page)),
                    json.dumps(sorted(set(warnings))),
                    provider,
                    page.original_image_key,
                    json.dumps(page.enhanced_image_keys or []),
                ),
            )
        avg_conf = float(result.metrics.get("average_confidence", 0.0) or 0.0)
        await cur.execute(
            """
            UPDATE files
            SET status='OCR_NEEDS_REVIEW',
                processing_progress=90,
                ocr_provider=%s,
                ocr_confidence=%s,
                last_error=NULL
            WHERE id=%s
            """,
            (provider, avg_conf, file_id),
        )
        await conn.commit()


async def _complete_job(
    job_id: str,
    method: str,
    normalized_key: str,
    markdown_key: str,
    raw_key: str,
    metrics_key: str,
    correction_key: str,
    timing_ms: dict[str, int] | None = None,
):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE ocr_jobs
            SET status='done',
                method=%s,
                output_json_key=%s,
                output_text_key=%s,
                raw_json_key=%s,
                metrics_json_key=%s,
                correction_log_key=%s,
                timing_ms=%s,
                finished_at=now(),
                error=NULL
            WHERE id::text=%s
            """,
            (
                method,
                normalized_key,
                markdown_key,
                raw_key,
                metrics_key,
                correction_key,
                json.dumps(timing_ms or {}),
                str(job_id),
            ),
        )
        await conn.commit()


async def _has_indexed_chunks(file_id: str) -> bool:
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT 1 FROM file_chunks WHERE file_id=%s AND chunk_vector IS NOT NULL LIMIT 1",
            (str(file_id),),
        )
        return bool(await cur.fetchone())


def _is_pptx(info: dict[str, Any]) -> bool:
    mime = str(info.get("mime_type") or "").lower().split(";")[0].strip()
    filename = str(info.get("filename") or "").lower()
    return mime == "application/vnd.openxmlformats-officedocument.presentationml.presentation" or filename.endswith(".pptx")


def _is_docx(info: dict[str, Any]) -> bool:
    mime = str(info.get("mime_type") or "").lower().split(";")[0].strip()
    filename = str(info.get("filename") or "").lower()
    return mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" or filename.endswith(".docx")


async def _fail_job(job_id: str, file_id: str, error: str):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE ocr_jobs
            SET status='failed',
                finished_at=now(),
                error=%s
            WHERE id::text=%s
            """,
            (error, str(job_id)),
        )
        await conn.commit()
    await update_file_status(file_id, "FAILED", error=error)


async def process_job(job: dict[str, Any]):
    job_started = time.perf_counter()
    stage_started = job_started
    timings: dict[str, int] = {}
    job_id = job["id"]
    file_id = job["file_id"]
    is_handwritten_review = str(job.get("engine") or "").lower() in {"handwritten", "handwritten_ocr", "image_notes"}
    info = await get_file_info(file_id)
    if not info:
        raise RuntimeError("File not found")

    if await _has_indexed_chunks(file_id):
        await update_file_status(file_id, "INDEXED", indexed=True)
        await _complete_job(job_id, "cached", "", "", "", "", "", {"cache_hit": 1})
        log.info("[ocr] skipped already indexed file_id=%s job_id=%s", file_id, job_id)
        return

    storage_backend = (info.get("storage_backend") or settings.storage_backend).lower()
    output_json_key = str(job["output_json_key"])
    output_text_key = str(job["output_text_key"])
    output_prefix = str(PurePosixPath(output_json_key).parent.parent)
    data = _read_file_bytes(info, file_id=file_id)
    timings["file_read_ms"] = int((time.perf_counter() - stage_started) * 1000)
    log.info(
        "[ocr] stage=file_read job_id=%s file_id=%s bytes=%d elapsed_ms=%d",
        job_id,
        file_id,
        len(data),
        timings["file_read_ms"],
    )

    log.info(
        "[ocr] processing started job_id=%s file_id=%s filename=%s backend=%s",
        job_id,
        file_id,
        info.get("filename"),
        storage_backend,
    )
    stage_started = time.perf_counter()
    await update_file_status(file_id, "RUNNING_OCR" if is_handwritten_review else "EXTRACTING_TEXT")
    result = extract_document(
        ExtractionInput(
            file_id=file_id,
            filename=str(info.get("filename") or "upload"),
            mime_type=info.get("mime_type"),
            data=data,
            output_prefix=output_prefix,
        ),
        artifact_writer=_make_artifact_writer(output_prefix, storage_backend),
    )
    timings["text_extraction_ms"] = int((time.perf_counter() - stage_started) * 1000)
    log.info(
        "[ocr] stage=text_extraction job_id=%s file_id=%s method=%s pages=%d elapsed_ms=%d",
        job_id,
        file_id,
        result.method.value,
        len(result.pages),
        timings["text_extraction_ms"],
    )

    if is_handwritten_review:
        await update_file_status(file_id, "PREPARING_REVIEW")

    normalized_key = output_json_key
    markdown_key = output_text_key
    raw_key = f"{output_prefix}/ocr/raw.json"
    metrics_key = f"{output_prefix}/ocr/metrics.json"
    correction_key = f"{output_prefix}/ocr/corrections.json"

    result.storage_manifest.update(
        {
            "normalized_json": normalized_key,
            "markdown": markdown_key,
            "raw_json": raw_key,
            "metrics_json": metrics_key,
            "correction_log": correction_key,
        }
    )

    stage_started = time.perf_counter()
    _write_bytes(normalized_key, result_json_bytes(result), "application/json", storage_backend)
    _write_bytes(markdown_key, result.markdown.encode("utf-8"), "text/markdown; charset=utf-8", storage_backend)
    _write_bytes(
        raw_key,
        json.dumps(result.raw, ensure_ascii=False, indent=2).encode("utf-8"),
        "application/json",
        storage_backend,
    )
    _write_bytes(
        metrics_key,
        json.dumps(result.metrics, ensure_ascii=False, indent=2).encode("utf-8"),
        "application/json",
        storage_backend,
    )
    _write_bytes(
        correction_key,
        json.dumps(result.correction_log, ensure_ascii=False, indent=2).encode("utf-8"),
        "application/json",
        storage_backend,
    )
    timings["artifact_write_ms"] = int((time.perf_counter() - stage_started) * 1000)
    log.info(
        "[ocr] stage=artifact_write job_id=%s file_id=%s elapsed_ms=%d",
        job_id,
        file_id,
        timings["artifact_write_ms"],
    )

    if is_handwritten_review:
        stage_started = time.perf_counter()
        await _store_handwritten_review_pages(file_id, info, result)
        timings["review_page_write_ms"] = int((time.perf_counter() - stage_started) * 1000)
        await _complete_job(
            job_id,
            f"{result.method.value}:needs_review",
            normalized_key,
            markdown_key,
            raw_key,
            metrics_key,
            correction_key,
            timings,
        )
        log.info(
            "[ocr] handwritten review ready job_id=%s file_id=%s pages=%d confidence=%.3f elapsed_ms=%d",
            job_id,
            file_id,
            len(result.pages),
            float(result.metrics.get("average_confidence", 0.0)),
            int((time.perf_counter() - job_started) * 1000),
        )
        return

    stage_started = time.perf_counter()
    page_texts = build_flashcard_source_pages(result.pages)
    timings["chunk_source_build_ms"] = int((time.perf_counter() - stage_started) * 1000)
    log.info(
        "[ocr] stage=chunk_source_build job_id=%s file_id=%s pages=%d elapsed_ms=%d",
        job_id,
        file_id,
        len(page_texts),
        timings["chunk_source_build_ms"],
    )

    await update_file_status(file_id, "CHUNKING")
    stage_started = time.perf_counter()
    chunks = build_deduped_chunks(page_texts)
    timings["chunking_only_ms"] = int((time.perf_counter() - stage_started) * 1000)
    log.info(
        "[ocr] stage=chunking_only job_id=%s file_id=%s chunk_candidates=%d elapsed_ms=%d",
        job_id,
        file_id,
        len(chunks),
        timings["chunking_only_ms"],
    )

    stage_started = time.perf_counter()
    await update_file_status(file_id, "GENERATING_EMBEDDINGS")
    total = await persist_chunk_embeddings(file_id, chunks) if chunks else 0
    timings["embeddings_and_db_ms"] = int((time.perf_counter() - stage_started) * 1000)
    log.info(
        "[ocr] stage=embeddings_and_db job_id=%s file_id=%s chunks=%d elapsed_ms=%d",
        job_id,
        file_id,
        total,
        timings["embeddings_and_db_ms"],
    )

    cache_set(
        f"filetext:{file_id}:{info['storage_key']}",
        result.markdown.encode("utf-8"),
        ttl_seconds=86400,
    )
    await _complete_job(
        job_id,
        result.method.value,
        normalized_key,
        markdown_key,
        raw_key,
        metrics_key,
        correction_key,
        timings,
    )
    await update_file_status(file_id, "INDEXED" if total > 0 else "OCR_DONE", indexed=total > 0)

    if _is_pptx(info) or _is_docx(info):
        pv_started = time.perf_counter()
        try:
            if _is_pptx(info):
                preview_result = await generate_office_preview(
                    document_id=file_id,
                    class_id=int(info["class_id"]),
                    data=data,
                    kind="pptx",
                )
                pv_label = "pptx_preview_post_index"
            else:
                preview_result = await generate_office_preview(
                    document_id=file_id,
                    class_id=int(info["class_id"]),
                    data=data,
                    kind="docx",
                )
                pv_label = "docx_preview_post_index"
            timings[f"{pv_label}_ms"] = int((time.perf_counter() - pv_started) * 1000)
            log.info(
                "[ocr] stage=%s job_id=%s file_id=%s viewer_status=%s pdf_url=%s err=%s elapsed_ms=%s (content status unchanged; document already indexed)",
                pv_label,
                job_id,
                file_id,
                preview_result.get("viewer_status"),
                preview_result.get("viewer_file_url"),
                preview_result.get("conversion_error"),
                timings.get(f"{pv_label}_ms", 0),
            )
            log.info(
                "[OFFICE_PREVIEW] generated viewer_file_url=%s document_id=%s",
                preview_result.get("viewer_file_url"),
                file_id,
            )
        except Exception as exc:
            log.warning("[ocr] post_index office preview failed file_id=%s err=%s", file_id, exc)

    ext_ms = timings.get("text_extraction_ms", 0)
    chunk_ms = timings.get("chunking_only_ms", 0) + timings.get("embeddings_and_db_ms", 0)
    pv_ms = sum(v for k, v in timings.items() if "preview" in k and k.endswith("_ms"))
    total_ms = int((time.perf_counter() - job_started) * 1000)
    fname = str(info.get("filename") or "upload")
    log.info(
        "[ocr] summary filename=%r extraction_ms=%s chunking_embeddings_ms=%s preview_ms=%s total_ms=%s indexed_chunks=%d",
        fname,
        ext_ms,
        chunk_ms,
        pv_ms,
        total_ms,
        total,
    )
    log.info(
        "[ocr] completed job_id=%s file_id=%s method=%s indexed_chunks=%d confidence=%.3f eligibility=%.3f uncertain=%d total_elapsed_ms=%d",
        job_id,
        file_id,
        result.method.value,
        total,
        float(result.metrics.get("average_confidence", 0.0)),
        float(result.metrics.get("average_flashcard_eligibility_score", 0.0)),
        int(result.metrics.get("uncertain_region_count", 0)),
        total_ms,
    )


async def run():
    global _stuck_recovery_counter
    await ensure_ocr_pipeline_schema()
    while True:
        job = await fetch_and_claim_job()
        if not job:
            _stuck_recovery_counter += 1
            if _stuck_recovery_counter >= 15:
                _stuck_recovery_counter = 0
                try:
                    recovered = await recover_stuck_documents()
                    if recovered:
                        log.info("[ocr] stuck_document_recovery updated_rows=%d", recovered)
                except Exception:
                    log.exception("[ocr] stuck_document_recovery failed")
            await asyncio.sleep(POLL_SECONDS)
            continue
        _stuck_recovery_counter = 0

        try:
            await asyncio.wait_for(process_job(job), timeout=_JOB_PROCESSING_TIMEOUT)
        except asyncio.TimeoutError:
            log.error(
                "[ocr] job timed out after %ss job_id=%s file_id=%s",
                int(_JOB_PROCESSING_TIMEOUT),
                job.get("id"),
                job.get("file_id"),
            )
            await _fail_job(
                job["id"],
                job["file_id"],
                f"Processing exceeded the maximum time ({int(_JOB_PROCESSING_TIMEOUT // 60)} min). Try a smaller file or retry.",
            )
        except Exception as exc:
            log.exception("[ocr] job failed job_id=%s file_id=%s", job.get("id"), job.get("file_id"))
            await _fail_job(job["id"], job["file_id"], str(exc))
        await asyncio.sleep(0)


if __name__ == "__main__":
    asyncio.run(run())
