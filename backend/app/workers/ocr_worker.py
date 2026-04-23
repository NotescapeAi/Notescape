import asyncio
import json
import logging
from pathlib import Path, PurePosixPath
from typing import Any

from app.core.cache import cache_set
from app.core.db import db_conn
from app.core.migrations import ensure_ocr_pipeline_schema
from app.core.settings import settings
from app.core.storage import get_object_bytes, put_bytes
from app.lib.indexing import index_file
from app.services.document_ingestion import ExtractionInput, extract_document, result_json_bytes
from app.services.flashcards.source_builder import build_flashcard_source_pages

POLL_SECONDS = 2
log = logging.getLogger("uvicorn.error")


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
            RETURNING id::text, file_id::text, output_text_key, output_json_key
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
                   files.mime_type,
                   files.filename,
                   files.storage_backend,
                   files.class_id,
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
        return dict(zip(cols, row))


def _local_path_for_key(storage_key: str) -> Path:
    rel = PurePosixPath(storage_key)
    return (Path(settings.upload_root) / Path(rel.as_posix())).resolve()


def _read_file_bytes(info: dict[str, Any]) -> bytes:
    storage_key = info["storage_key"]
    if not storage_key:
        raise RuntimeError("File has no storage key")
    if (info.get("storage_backend") or settings.storage_backend).lower() == "local":
        path = _local_path_for_key(str(storage_key))
        return path.read_bytes()
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
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE files
            SET status=%s,
                last_error=%s,
                indexed_at=CASE WHEN %s THEN now() ELSE indexed_at END
            WHERE id=%s
            """,
            (status, error, indexed, str(file_id)),
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
                finished_at=now(),
                error=NULL
            WHERE id::text=%s
            """,
            (method, normalized_key, markdown_key, raw_key, metrics_key, correction_key, str(job_id)),
        )
        await conn.commit()


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
    job_id = job["id"]
    file_id = job["file_id"]
    info = await get_file_info(file_id)
    if not info:
        raise RuntimeError("File not found")

    storage_backend = (info.get("storage_backend") or settings.storage_backend).lower()
    output_json_key = str(job["output_json_key"])
    output_text_key = str(job["output_text_key"])
    output_prefix = str(PurePosixPath(output_json_key).parent.parent)
    data = _read_file_bytes(info)

    log.info(
        "[ocr] processing started job_id=%s file_id=%s filename=%s backend=%s",
        job_id,
        file_id,
        info.get("filename"),
        storage_backend,
    )
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

    page_texts = build_flashcard_source_pages(result.pages)
    total = await index_file(file_id, page_texts=page_texts)
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
    )
    await update_file_status(file_id, "INDEXED" if total > 0 else "OCR_DONE", indexed=total > 0)
    log.info(
        "[ocr] completed job_id=%s file_id=%s method=%s indexed_chunks=%d confidence=%.3f eligibility=%.3f uncertain=%d",
        job_id,
        file_id,
        result.method.value,
        total,
        float(result.metrics.get("average_confidence", 0.0)),
        float(result.metrics.get("average_flashcard_eligibility_score", 0.0)),
        int(result.metrics.get("uncertain_region_count", 0)),
    )


async def run():
    await ensure_ocr_pipeline_schema()
    while True:
        job = await fetch_and_claim_job()
        if not job:
            await asyncio.sleep(POLL_SECONDS)
            continue

        try:
            await process_job(job)
        except Exception as exc:
            log.exception("[ocr] job failed job_id=%s file_id=%s", job.get("id"), job.get("file_id"))
            await _fail_job(job["id"], job["file_id"], str(exc))
        await asyncio.sleep(0)


if __name__ == "__main__":
    asyncio.run(run())
