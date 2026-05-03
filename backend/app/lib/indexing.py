from typing import List, Optional, Dict, Any
import logging
import time

from app.core.db import db_conn
from app.core.llm import get_embedder
from app.core.embedding_cache import embed_texts_cached
from app.lib.chunking import chunk_by_pages, chunk_by_chars

log = logging.getLogger("uvicorn.error")


def _vec_literal(vec: List[float]) -> str:
    return "[" + ",".join(str(x) for x in vec) + "]"


def _prepare_chunks(page_texts: Optional[List[str]], raw_text: Optional[str]) -> List[Dict[str, Any]]:
    if page_texts:
        return chunk_by_pages(page_texts, pages_per_chunk=1, overlap_pages=0)
    if raw_text:
        return chunk_by_chars(raw_text, size_chars=2000, overlap_chars=200)
    return []


def _dedupe_chunks(chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: set[str] = set()
    out: List[Dict[str, Any]] = []
    for chunk in chunks:
        normalized = " ".join(str(chunk.get("content") or "").split())
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        next_chunk = dict(chunk)
        next_chunk["idx"] = len(out)
        out.append(next_chunk)
    return out


def build_deduped_chunks(
    page_texts: Optional[List[str]] = None, raw_text: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Synchronous chunking only (no embeddings). Used to split indexing stages for status updates."""
    return _dedupe_chunks(_prepare_chunks(page_texts, raw_text))


async def persist_chunk_embeddings(file_id: str, chunks: List[Dict[str, Any]]) -> int:
    """Embed ``chunks`` and write rows to ``file_chunks`` (replaces existing rows for ``file_id``)."""
    if not chunks:
        return 0
    started = time.perf_counter()
    embedder = get_embedder()
    texts = [c["content"] for c in chunks]
    vecs = await embed_texts_cached(embedder, texts, ttl_seconds=86400)
    log.info(
        "[indexing] stage=embeddings file_id=%s chunks=%d elapsed_ms=%d",
        file_id,
        len(chunks),
        int((time.perf_counter() - started) * 1000),
    )

    stage_started = time.perf_counter()
    async with db_conn() as (conn, cur):
        await cur.execute("DELETE FROM file_chunks WHERE file_id=%s", (file_id,))
        rows = [
            (
                file_id,
                c["idx"],
                c["content"],
                c["char_len"],
                c["page_start"],
                c["page_end"],
                _vec_literal(vec),
            )
            for c, vec in zip(chunks, vecs)
        ]
        await cur.executemany(
            """
            INSERT INTO file_chunks (file_id, idx, content, char_len, page_start, page_end, chunk_vector)
            VALUES (%s, %s, %s, %s, %s, %s, %s::vector)
            """,
            rows,
        )
        await conn.commit()

    log.info(
        "[indexing] stage=db_write file_id=%s chunks=%d elapsed_ms=%d",
        file_id,
        len(chunks),
        int((time.perf_counter() - stage_started) * 1000),
    )
    return len(chunks)


async def index_file(file_id: str, page_texts: Optional[List[str]] = None, raw_text: Optional[str] = None) -> int:
    started = time.perf_counter()
    chunks = build_deduped_chunks(page_texts, raw_text)
    log.info(
        "[indexing] stage=chunking file_id=%s chunks=%d elapsed_ms=%d",
        file_id,
        len(chunks),
        int((time.perf_counter() - started) * 1000),
    )
    if not chunks:
        return 0

    n = await persist_chunk_embeddings(file_id, chunks)
    log.info(
        "[indexing] indexed file %s with %d chunks total_elapsed_ms=%d",
        file_id,
        n,
        int((time.perf_counter() - started) * 1000),
    )
    return n
