from typing import List, Optional, Dict, Any
import logging

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


async def index_file(file_id: str, page_texts: Optional[List[str]] = None, raw_text: Optional[str] = None) -> int:
    chunks = _prepare_chunks(page_texts, raw_text)
    if not chunks:
        return 0

    embedder = get_embedder()
    texts = [c["content"] for c in chunks]
    vecs = await embed_texts_cached(embedder, texts, ttl_seconds=86400)

    async with db_conn() as (conn, cur):
        await cur.execute("DELETE FROM file_chunks WHERE file_id=%s", (file_id,))
        for c, vec in zip(chunks, vecs):
            await cur.execute(
                """
                INSERT INTO file_chunks (file_id, idx, content, char_len, page_start, page_end, chunk_vector)
                VALUES (%s, %s, %s, %s, %s, %s, %s::vector)
                """,
                (
                    file_id,
                    c["idx"],
                    c["content"],
                    c["char_len"],
                    c["page_start"],
                    c["page_end"],
                    _vec_literal(vec),
                ),
            )
        await conn.commit()

    log.info(f"[indexing] indexed file {file_id} with {len(chunks)} chunks")
    return len(chunks)
