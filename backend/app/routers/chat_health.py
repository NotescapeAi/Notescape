from fastapi import APIRouter
from app.core.chat_llm import chat_completion

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.get("/health")
def chat_health():
    system = "You are a helpful assistant."
    user = "Reply with exactly: OK"
    out = chat_completion(system, user, temperature=0.0).strip()
    return {"chat_model_reply": out}
