from typing import List, Dict, Any, Optional

from groq import Groq
from app.core.settings import settings


def get_chat_client() -> Groq:
    api_key = settings.groq_api_key
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is missing in environment")
    return Groq(api_key=api_key)


def get_chat_model() -> str:
    # Chatbot model (separate from flashcards GEN_MODEL)
    return settings.chat_model


def chat_completion(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.2,
) -> str:
    """
    Calls Groq chat completion using CHAT_MODEL.
    Returns assistant text only.
    """
    client = get_chat_client()
    model = get_chat_model()

    resp = client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )

    return resp.choices[0].message.content or ""
