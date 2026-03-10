# app/routers/chat_ask.py
"""
POST /api/chat/ask
──────────────────
The single unified endpoint the frontend calls.
Replaces any previous hard-coded RAG-only ask endpoint.

Payload
───────
{
  "class_id":   123,
  "question":   "What is Newton's second law?",
  "top_k":      6,          // optional, default 6
  "file_ids":   ["uuid1"],  // optional, scope to specific files
  "mode":       "auto"      // "auto" | "rag" | "general"  (default "auto")
}

Response
────────
{
  "answer":         "...",
  "mode":           "rag" | "general",
  "citations":      [{chunk_id, filename, page_start, page_end, similarity}],
  "web_sources":    [{title, url}],
  "top_similarity": 0.72
}
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
import logging

from app.core.smart_router import smart_ask
from app.dependencies import get_request_user_uid
from app.core.db import db_conn

router = APIRouter(prefix="/api/chat", tags=["chat"])
log = logging.getLogger("uvicorn.error")


# ── Request / Response models ─────────────────────────────────────────────────

class AskRequest(BaseModel):
    class_id:  int
    question:  str
    top_k:     int                        = Field(default=6,    ge=1, le=20)
    file_ids:  Optional[List[str]]        = None
    mode:      Optional[str]              = "auto"   # "auto" | "rag" | "general"


class CitationOut(BaseModel):
    chunk_id:   int
    filename:   str
    page_start: Optional[int]
    page_end:   Optional[int]
    similarity: float


class WebSourceOut(BaseModel):
    title: str
    url:   str


class AskResponse(BaseModel):
    answer:         str
    mode:           str          # "rag" | "general"
    citations:      List[CitationOut]  = []
    web_sources:    List[WebSourceOut] = []
    top_similarity: float              = 0.0


# ── Ownership guard ───────────────────────────────────────────────────────────

async def _verify_class_owner(class_id: int, user_id: str) -> None:
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT 1 FROM classes WHERE id=%s AND owner_uid=%s",
            (class_id, user_id),
        )
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Class not found")


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/ask", response_model=AskResponse)
async def ask(
    payload: AskRequest,
    user_id: str = Depends(get_request_user_uid),
):
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    # Validate mode value
    allowed_modes = {"auto", "rag", "general"}
    mode = (payload.mode or "auto").lower()
    if mode not in allowed_modes:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mode '{mode}'. Must be one of: {allowed_modes}",
        )

    await _verify_class_owner(payload.class_id, user_id)

    log.info(
        "[chat_ask] user=%s class=%s mode=%s q=%r",
        user_id,
        payload.class_id,
        mode,
        payload.question[:100],
    )

    result = await smart_ask(
        question=payload.question,
        class_id=payload.class_id,
        top_k=payload.top_k,
        file_ids=payload.file_ids,
        force_mode=None if mode == "auto" else mode,
    )

    return AskResponse(
        answer=result["answer"],
        mode=result["mode"],
        citations=[CitationOut(**c) for c in result.get("citations", [])],
        web_sources=[WebSourceOut(**s) for s in result.get("web_sources", [])],
        top_similarity=result.get("top_similarity", 0.0),
    )