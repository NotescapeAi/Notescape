# app/core/llm.py
import os
import json
from typing import List, Tuple, Callable, Dict, Any

# =========================
# Environment & defaults
# =========================
# LLM for card generation: fake | groq | together | openai
LLM_PROVIDER   = os.getenv("LLM_PROVIDER", "fake").lower()

# Embedding provider: local | together | openai | fake
# "local" uses sentence-transformers (free, offline)
EMBED_PROVIDER = os.getenv("EMBED_PROVIDER", "local").lower()

# Local embedding model (free). Works with SentenceTransformer("all-MiniLM-L6-v2")
# You can also set EMBED_MODEL=sentence-transformers/all-MiniLM-L6-v2 in .env
EMBED_MODEL    = os.getenv("EMBED_MODEL", "all-MiniLM-L6-v2")

# Your pgvector column is VECTOR(1536) — keep this unless you ALTER TABLE.
EMBED_DIM      = int(os.getenv("EMBED_DIM", "1536"))

# Chat model & temperature (used when LLM_PROVIDER != fake)
# Groq examples: "llama-3.1-8b-instant", "llama-3.1-70b-versatile"
# Together example: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo"
# OpenAI example: "gpt-4o-mini"
GEN_MODEL      = os.getenv("GEN_MODEL", "llama-3.1-8b-instant")
GEN_T          = float(os.getenv("GEN_T", "0.2"))

# =========================
# Card generation prompt
# =========================
SYSTEM_PROMPT = """You are an expert teacher. Draft clear, factually correct
flashcards (recall questions, not essays) from the provided context.

Rules:
- Prefer definition, cause→effect, compare/contrast, and simple numeric recall.
- No trivial one-word questions, no duplicates, no copy-paste of slide bullets.
- Keep question ≤ 140 chars, answer ≤ 240 chars. Add 1 short hint if useful.
- difficulty ∈ {easy, medium, hard}. Use 'tags': ['auto'] minimally.

Return ONLY JSON:
{"cards":[
  {"question":"...", "answer":"...", "hint":"...", "difficulty":"medium", "tags":["auto"]}
]}"""

# =========================
# Helpers
# =========================
def _pad_to_dim(vecs: List[List[float]], dim: int) -> List[List[float]]:
    out: List[List[float]] = []
    for v in vecs:
        if len(v) == dim:
            out.append(v)
        elif len(v) > dim:
            out.append(v[:dim])
        else:
            out.append(v + [0.0] * (dim - len(v)))
    return out

def _extract_json_block(s: str) -> str:
    """
    Tries to extract a valid top-level JSON object from s (handles stray text/code fences).
    Returns s unchanged if it already looks like JSON.
    """
    s = s.strip()
    if s.startswith("{") and s.endswith("}"):
        return s
    # Remove common code fence wrappers
    if s.startswith("```"):
        s = s.strip("`")
        # after stripping fences, try again quickly
        s = s.strip()
        if s.startswith("{") and s.endswith("}"):
            return s
    # Fallback: find first '{' and last '}' to slice
    try:
        start = s.index("{")
        end = s.rindex("}") + 1
        candidate = s[start:end]
        # quick validation
        json.loads(candidate)
        return candidate
    except Exception:
        return s  # let caller handle

# =========================
# Embeddings
# =========================
class Embedder:
    def __init__(self, fn: Callable[[List[str]], Any], dim: int):
        self._fn = fn
        self.dim = dim

    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        return await self._fn(texts)

def get_embedder() -> Embedder:
    # ---- Local (free) embeddings via sentence-transformers ----
    if EMBED_PROVIDER == "local":
        try:
            from sentence_transformers import SentenceTransformer
        except Exception as e:
            raise RuntimeError(
                "sentence-transformers is required for EMBED_PROVIDER=local.\n"
                "Install it: pip install 'sentence-transformers==2.7.0'"
            ) from e

        # Works with "all-MiniLM-L6-v2" or "sentence-transformers/all-MiniLM-L6-v2"
        model = SentenceTransformer(EMBED_MODEL)
        native_dim = model.get_sentence_embedding_dimension()

        async def _embed(texts: List[str]) -> List[List[float]]:
            vecs = model.encode(texts, normalize_embeddings=True).tolist()
            # Pad/truncate to your pgvector width:
            return _pad_to_dim(vecs, EMBED_DIM)

        return Embedder(_embed, EMBED_DIM)

    # ---- Together (OpenAI-compatible client) ----
    if EMBED_PROVIDER == "together":
        import openai  # openai client also supports custom base_url
        openai.api_key = os.environ["TOGETHER_API_KEY"]
        openai.base_url = os.getenv("TOGETHER_BASE_URL", "https://api.together.xyz/v1")
        together_embed_model = os.getenv(
            "TOGETHER_EMBED_MODEL", "mixedbread-ai/mxbai-embed-large-v1"
        )

        async def _embed(texts: List[str]) -> List[List[float]]:
            resp = openai.embeddings.create(model=together_embed_model, input=texts)
            vecs = [d.embedding for d in resp.data]
            return _pad_to_dim(vecs, EMBED_DIM)

        return Embedder(_embed, EMBED_DIM)

    # ---- OpenAI ----
    if EMBED_PROVIDER == "openai":
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        openai_embed_model = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small")

        async def _embed(texts: List[str]) -> List[List[float]]:
            resp = client.embeddings.create(model=openai_embed_model, input=texts)
            return [d.embedding for d in resp.data]

        # text-embedding-3-small is 1536-dim, matches default EMBED_DIM
        return Embedder(_embed, EMBED_DIM)

    # ---- Fake (zeros), for quick boot/tests ----
    async def _fake(texts: List[str]) -> List[List[float]]:
        return [[0.0] * EMBED_DIM for _ in texts]

    return Embedder(_fake, EMBED_DIM)

# =========================
# Card generator (chat)
# =========================
class CardGenerator:
    def __init__(self, fn: Callable[[str, str], Any]):
        self._fn = fn

    async def generate(self, joined_context: str, n_cards: int) -> List[Dict[str, Any]]:
        system = SYSTEM_PROMPT
        user = (
            f"Context:\n{joined_context}\n\n"
            f"Create exactly {n_cards} high-yield, fact-checked flashcards. "
            "Avoid fluff; prefer precise definitions, cause→effect, and contrasts. "
            "Return ONLY the JSON schema above."
        )
        raw = await self._fn(system, user)

        # be resilient to non-perfect outputs
        try:
            clean = _extract_json_block(raw)
            data = json.loads(clean)
            cards = data.get("cards", [])
            if not isinstance(cards, list):
                raise ValueError("cards is not a list")
        except Exception:
            cards = [{
                "question": "Summarize the main idea.",
                "answer": raw,
                "hint": None,
                "difficulty": "medium",
                "tags": ["auto"]
            }]
        # trim overly long fields (safety)
        out: List[Dict[str, Any]] = []
        for c in cards:
            q = (c.get("question") or "").strip()[:140]
            a = (c.get("answer") or "").strip()[:240]
            if not q or not a:
                continue
            item = {
                "question": q,
                "answer": a,
                "hint": (c.get("hint") or None),
                "difficulty": (c.get("difficulty") or "medium"),
                "tags": c.get("tags") or ["auto"],
            }
            out.append(item)
        return out

def get_card_generator() -> CardGenerator:
    # ---- Groq (Llama 3.x) ----
    if LLM_PROVIDER == "groq":
        from groq import Groq
        client = Groq(api_key=os.environ["GROQ_API_KEY"])
        model = os.getenv("GEN_MODEL", GEN_MODEL)
        temperature = float(os.getenv("GEN_T", str(GEN_T)))

        async def _chat(system: str, user: str) -> str:
            r = client.chat.completions.create(
                model=model,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            return r.choices[0].message.content

        return CardGenerator(_chat)

    # ---- Together (OpenAI-compatible) ----
    if LLM_PROVIDER == "together":
        import openai
        openai.api_key = os.environ["TOGETHER_API_KEY"]
        openai.base_url = os.getenv("TOGETHER_BASE_URL", "https://api.together.xyz/v1")
        model = os.getenv("GEN_MODEL", "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo")
        temperature = float(os.getenv("GEN_T", str(GEN_T)))

        async def _chat(system: str, user: str) -> str:
            r = openai.chat.completions.create(
                model=model,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            return r.choices[0].message.content

        return CardGenerator(_chat)

    # ---- OpenAI ----
    if LLM_PROVIDER == "openai":
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        model = os.getenv("GEN_MODEL", "gpt-4o-mini")
        temperature = float(os.getenv("GEN_T", str(GEN_T)))

        async def _chat(system: str, user: str) -> str:
            r = client.chat.completions.create(
                model=model,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            return r.choices[0].message.content

        return CardGenerator(_chat)

    # ---- Fake ----
    async def _fake(system: str, user: str) -> str:
        return '{"cards":[{"question":"Demo?","answer":"Demo","difficulty":"easy","tags":["auto"]}]}'

    return CardGenerator(_fake)
