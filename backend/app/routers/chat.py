from typing import List, Dict, Any, Optional
import hashlib
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.chat_llm import chat_completion
from app.core.llm import get_embedder
from app.core.embedding_cache import embed_texts_cached
from app.core.cache import cache_get_json, cache_set_json
from app.core.settings import settings
from app.core.db import db_conn  # use your existing DB helper
from app.dependencies import get_request_user_uid

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatAskReq(BaseModel):
    class_id: int
    question: str
    top_k: int = Field(default=8, ge=1, le=30)

    # ✅ NEW: If provided, limit retrieval to these file ids (PDF-only / file-only mode)
    # Keep it Optional so old clients still work.
    file_ids: Optional[List[str]] = None


def _vec_literal(vec: List[float]) -> str:
    return "[" + ",".join(f"{x:.8f}" for x in vec) + "]"


async def _retrieve_chunks(class_id: int, qvec: List[float], top_k: int, file_ids: Optional[List[str]]):
    """
    Retrieves top_k chunks using pgvector similarity.
    Supports:
      - class mode: file_ids is None/empty -> search all files in class
      - file-only mode: file_ids has values -> search only those files
    """
    vec_lit = _vec_literal(qvec)
    file_ids = file_ids or []  # normalize None -> []

    sql = """
      SELECT
        fc.id,
        fc.content,
        fc.page_start,
        fc.page_end,
        f.id AS file_id,
        f.filename
      FROM file_chunks fc
      JOIN files f ON f.id = fc.file_id
      WHERE f.class_id = %s
        AND fc.chunk_vector IS NOT NULL
        AND (cardinality(%s::uuid[]) = 0 OR f.id = ANY(%s::uuid[]))
      ORDER BY fc.chunk_vector <=> %s::vector
      LIMIT %s
    """

    async with db_conn() as (conn, cur):
        # Note: we pass file_ids twice because SQL uses it twice
        await cur.execute(sql, (class_id, file_ids, file_ids, vec_lit, top_k))
        rows = await cur.fetchall()

    return rows


def _chat_cache_key(user_id: str, class_id: int, question: str, top_k: int, file_ids: Optional[List[str]]) -> str:
    scope = ",".join(sorted(file_ids or []))
    h = hashlib.sha256(question.encode("utf-8")).hexdigest()
    return f"chat:{user_id}:{class_id}:{top_k}:{settings.chat_model}:{scope}:{h}"


@router.post("/ask")
async def ask(req: ChatAskReq, user_id: str = Depends(get_request_user_uid)):
    cache_key = _chat_cache_key(user_id, req.class_id, req.question, req.top_k, req.file_ids)
    cached = cache_get_json(cache_key)
    if isinstance(cached, dict) and "answer" in cached:
        return cached

    # 1) Embed the question
    embedder = get_embedder()
    qvec = (await embed_texts_cached(embedder, [req.question]))[0]

    # 2) Retrieve relevant chunks (class mode OR file-only mode)
    rows = await _retrieve_chunks(req.class_id, qvec, req.top_k, req.file_ids)

    if not rows:
        return {
            "answer": "No indexed material found for this scope yet. Please upload and ensure chunks + embeddings are built.",
            "citations": [],
        }

    # 3) Build context + citations
    citations: List[Dict[str, Any]] = []
    context_blocks: List[str] = []

    for (chunk_id, content, p1, p2, file_id, filename) in rows:
        citations.append(
            {
                "chunk_id": chunk_id,
                "file_id": str(file_id),
                "filename": filename,
                "page_start": p1,
                "page_end": p2,
            }
        )

        context_blocks.append(
            f"[Source: {filename} p{p1}-{p2} | chunk:{chunk_id}]\n{content}"
        )

    context = "\n\n---\n\n".join(context_blocks)

    # 4) Ask chatbot model (Groq)
    system = (
        "You are a study assistant for a student.\n"
        "Answer ONLY using the provided context from uploaded material.\n"
        "If the answer is not present in the context, reply exactly:\n"
        "\"Not found in the uploaded material.\"\n"
        "Do NOT add sources/citations in your answer text.\n"
    )

    user = f"Question:\n{req.question}\n\nContext:\n{context}"
    answer = chat_completion(system, user, temperature=0.2).strip()

    payload = {"answer": answer, "citations": citations}
    cache_set_json(cache_key, payload, ttl_seconds=600)
    return payload
