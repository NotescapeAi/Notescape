# app/core/llm.py
from typing import List, Dict
from app.core.settings import settings

# "fake" embeddings use numpy to create deterministic vectors
import hashlib
import math
import numpy as np

EMBED_DIM = 1536

# Lazy import OpenAI only if needed
_openai_client = None

def _get_openai():
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI
        _openai_client = OpenAI()
    return _openai_client

def embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Returns a list of 1536-d vectors.
    - If LLM_PROVIDER=openai => real embeddings
    - If LLM_PROVIDER=fake   => deterministic local vectors (no API)
    """
    provider = settings.llm_provider.lower().strip()

    if provider == "openai":
        client = _get_openai()
        resp = client.embeddings.create(
            model=settings.openai_embed_model,
            input=texts or [""],
        )
        return [d.embedding for d in resp.data]

    # FAKE: deterministic vector from text hash
    vecs: List[List[float]] = []
    for t in texts:
        h = hashlib.sha256((t or "").encode("utf-8")).digest()
        # seed RNG with first 8 bytes as int to keep it deterministic
        seed = int.from_bytes(h[:8], "big", signed=False)
        rng = np.random.default_rng(seed)
        v = rng.normal(0, 1, EMBED_DIM).astype(np.float32)
        norm = float(np.linalg.norm(v)) or 1.0
        v = (v / norm).tolist()
        vecs.append(v)
    return vecs

def generate_flashcards(context: str, n_cards: int) -> List[Dict]:
    """
    Returns [{"question":..., "answer":..., "hint":..., "difficulty":..., "tags":[...]}]
    - openai: calls chat.completions
    - fake: trivial cards from context (no API)
    """
    provider = settings.llm_provider.lower().strip()

    if provider == "openai":
        try:
            client = _get_openai()
            system = (
                "You create concise, exam-style flashcards. "
                "Output ONLY valid JSON: {\"cards\": [{\"question\": \"...\", \"answer\": \"...\", "
                "\"hint\": \"optional\", \"difficulty\": \"easy|medium|hard\", \"tags\": [\"...\"]}, ...]}"
            )
            user = (
                "Context:\n" + context + "\n\n"
                f"Make exactly {n_cards} flashcards. Be precise and avoid fluff."
            )
            comp = client.chat.completions.create(
                model=settings.openai_chat_model,
                messages=[{"role":"system","content":system},
                          {"role":"user","content":user}],
                temperature=0.2,
            )
            import json
            content = (comp.choices[0].message.content or "").strip()
            data = json.loads(content)
            cards = data.get("cards", [])
            if isinstance(cards, list) and cards:
                return cards
        except Exception:
            # fall through to fake on error
            pass

    # FAKE: naive cards built from the context
    lines = [ln.strip() for ln in (context or "").splitlines() if ln.strip()]
    if not lines:
        lines = ["No content available."]
    step = max(1, math.ceil(len(lines) / max(1, n_cards)))
    cards = []
    for i in range(0, len(lines), step):
        snippet = " ".join(lines[i:i+step])[:240]
        if not snippet:
            continue
        cards.append({
            "question": f"What is the key idea in: \"{snippet[:100]}\"?",
            "answer": snippet,
            "hint": None,
            "difficulty": "medium",
            "tags": [],
        })
        if len(cards) >= n_cards:
            break
    return cards
