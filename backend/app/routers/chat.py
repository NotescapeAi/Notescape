from typing import List, Dict, Any, Optional
import hashlib
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.smart_router import smart_ask
from app.core.cache import cache_get_json, cache_set_json
from app.core.settings import settings
from app.dependencies import get_request_user_uid

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatAskReq(BaseModel):
    class_id: int
    question: str
    top_k: int = Field(default=8, ge=1, le=30)
    file_ids: Optional[List[str]] = None
    mode: Optional[str] = "auto"  # "auto", "rag", "general"


def _chat_cache_key(user_id: str, class_id: int, question: str, top_k: int, file_ids: Optional[List[str]], mode: str) -> str:
    scope = ",".join(sorted(file_ids or []))
    h = hashlib.sha256(question.encode("utf-8")).hexdigest()
    return f"chat:{user_id}:{class_id}:{top_k}:{settings.chat_model}:{scope}:{mode}:{h}"


@router.post("/ask")
async def ask(req: ChatAskReq, user_id: str = Depends(get_request_user_uid)):
    # Normalize mode for cache and logic
    mode_val = req.mode if req.mode else "auto"
    
    cache_key = _chat_cache_key(user_id, req.class_id, req.question, req.top_k, req.file_ids, mode_val)
    cached = cache_get_json(cache_key)
    if isinstance(cached, dict) and "answer" in cached:
        return cached

    # Map "auto" -> None for smart_ask
    force_mode = mode_val if mode_val in ["rag", "general"] else None

    # Use Smart Router (RAG vs General Knowledge)
    result = await smart_ask(
        question=req.question,
        class_id=req.class_id,
        top_k=req.top_k,
        file_ids=req.file_ids,
        force_mode=force_mode
    )

    cache_set_json(cache_key, result, ttl_seconds=600)
    return result
