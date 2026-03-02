from typing import List, Dict, Any, Optional
import hashlib
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

log = logging.getLogger("uvicorn.error")

from app.core.chat_llm import chat_completion
from app.core.llm import get_embedder
from app.core.embedding_cache import embed_texts_cached
from app.core.cache import cache_get_json, cache_set_json
from app.core.settings import settings
from app.core.db import db_conn  # use your existing DB helper
from app.dependencies import get_request_user_uid

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatAskReq(BaseModel):
    class_id: int
    question: str
    top_k: int = Field(default=8, ge=1, le=30)
    file_ids: Optional[List[str]] = None
    messages: Optional[List[ChatMessage]] = None


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
    
    # Filter out invalid UUIDs to prevent SQL errors
    valid_file_ids = []
    for fid in file_ids:
        if len(fid) == 36: # Simple length check for UUID
             valid_file_ids.append(fid)
        else:
            log.warning(f"[chat] Ignored invalid file_id: {fid}")
            
    file_ids = valid_file_ids

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
    # 0) Condense question if history exists
    standalone_question = req.question
    if req.messages:
        # Construct history string for context
        history_str = "\n".join([f"{m.role}: {m.content}" for m in req.messages[-6:]])
        
        system_condense = (
            "Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.\n"
            "Chat History:\n"
            f"{history_str}\n"
        )
        user_condense = f"Follow Up Input: {req.question}\nStandalone question:"
        
        # Rewrite the question
        try:
            condensed = chat_completion(system_condense, user_condense, temperature=0.1).strip()
            if condensed and len(condensed) > 5 and "not found" not in condensed.lower():
                standalone_question = condensed
                log.info(f"[chat] Rewrote question: '{req.question}' -> '{standalone_question}'")
        except Exception as e:
            log.warning(f"[chat] Failed to condense question: {e}")

    cache_key = _chat_cache_key(user_id, req.class_id, standalone_question, req.top_k, req.file_ids)
    cached = cache_get_json(cache_key)
    if isinstance(cached, dict) and "answer" in cached:
        return cached

    # 1) Embed the question (use standalone)
    embedder = get_embedder()
    qvec = (await embed_texts_cached(embedder, [standalone_question]))[0]

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
                "chunk_id": str(chunk_id),
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
        "You are an advanced Study Assistant. Follow this 4-step reasoning chain for every response:\n"
        "1. **Understand**: Analyze the user's question and identified key concepts.\n"
        "2. **Retrieve**: Select the most relevant information from the provided context.\n"
        "3. **Synthesize**: Combine the information into a coherent, comprehensive answer.\n"
        "4. **Refine**: Review your answer for clarity, grammar, and flow. Ensure it meets the minimum length requirement.\n\n"
        "**Output Guidelines**:\n"
        "- **Length**: The response must be substantive (at least 150 tokens) unless the question is trivial.\n"
        "- **Structure**: Use clear headings (Key Findings, Detailed Explanation, Practical Application, Summary), bullet points, and numbered lists.\n"
        "- **Quality**: Ensure perfect grammar, logical flow, and academic tone.\n"
        "- **Constraints**: Answer ONLY using the provided context. If not found, state 'Not found in the uploaded material.'\n"
    )

    user = f"Question:\n{standalone_question}\n\nContext:\n{context}"
    answer = chat_completion(system, user, temperature=0.2).strip()

    log.info(
        "[chat] ask user_id=%s class_id=%s question=%s answer_len=%d headers=%d bullets=%d",
        user_id,
        req.class_id,
        req.question,
        len(answer),
        answer.count("**"),
        answer.count("\n- ") + answer.count("\n* ") + answer.count("\n1. "),
    )

    payload = {"answer": answer, "citations": citations}
    cache_set_json(cache_key, payload, ttl_seconds=600)
    return payload
