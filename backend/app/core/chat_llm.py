import os
from typing import List, Dict, Any, Optional

from groq import Groq


def get_chat_client() -> Groq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is missing in environment")
    return Groq(api_key=api_key)


def get_chat_model() -> str:
    # Chatbot model (separate from flashcards GEN_MODEL)
    return os.getenv("CHAT_MODEL", "llama-3.3-70b-versatile")


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
