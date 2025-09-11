# app/core/llm.py
import os
from typing import List, Tuple, Callable, Dict, Any

# -----------------------
# Env & defaults
# -----------------------
LLM_PROVIDER   = os.getenv("LLM_PROVIDER", "fake").lower()     # fake | groq | together | openai
EMBED_PROVIDER = os.getenv("EMBED_PROVIDER", "local").lower()  # local | together | openai | fake

# Local free model (good + small). You can swap to any sentence-transformers model.
EMBED_MODEL    = os.getenv("EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
# Your pgvector column is VECTOR(1536). We’ll pad/truncate to this width when using smaller local models.
EMBED_DIM      = int(os.getenv("EMBED_DIM", "1536"))

# Chat model + temperature
# Groq examples: "llama-3.1-8b-instant" (fast) or "llama-3.1-70b-versatile" (higher quality)
# Together example: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo"
GEN_MODEL      = os.getenv("GEN_MODEL", "llama-3.1-8b-instant")
GEN_T          = float(os.getenv("GEN_T", "0.2"))

def _pad_to_dim(vecs: List[List[float]], dim: int) -> List[List[float]]:
    out = []
    for v in vecs:
        if len(v) == dim:
            out.append(v)
        elif len(v) > dim:
            out.append(v[:dim])
        else:
            out.append(v + [0.0] * (dim - len(v)))
    return out

# -----------------------
# Embeddings
# -----------------------
class Embedder:
    def __init__(self, fn: Callable[[List[str]], Any], dim: int):
        self._fn = fn
        self.dim = dim

    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        return await self._fn(texts)

def get_embedder() -> Embedder:
    # Local free (recommended): sentence-transformers
    if EMBED_PROVIDER == "local":
        try:
            from sentence_transformers import SentenceTransformer
        except Exception as e:
            raise RuntimeError(
                "sentence-transformers is required for EMBED_PROVIDER=local. "
                "Run: pip install 'sentence-transformers==2.7.0'"
            ) from e

        model = SentenceTransformer(EMBED_MODEL)
        native_dim = model.get_sentence_embedding_dimension()

        async def _embed(texts: List[str]) -> List[List[float]]:
            vecs = model.encode(texts, normalize_embeddings=True).tolist()
            return _pad_to_dim(vecs, EMBED_DIM)

        return Embedder(_embed, EMBED_DIM)

    # Together (OpenAI-compatible)
    if EMBED_PROVIDER == "together":
        import openai
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

    # OpenAI
    if EMBED_PROVIDER == "openai":
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        openai_embed_model = os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-small")

        async def _embed(texts: List[str]) -> List[List[float]]:
            resp = client.embeddings.create(model=openai_embed_model, input=texts)
            return [d.embedding for d in resp.data]

        return Embedder(_embed, EMBED_DIM)

    # Fake (zeros)
    async def _fake(texts: List[str]) -> List[List[float]]:
        return [[0.0] * EMBED_DIM for _ in texts]

    return Embedder(_fake, EMBED_DIM)

# -----------------------
# Card generator (chat)
# -----------------------
class CardGenerator:
    def __init__(self, fn: Callable[[str, str], Any]):
        self._fn = fn

    async def generate(self, joined_context: str, n_cards: int) -> List[Dict[str, Any]]:
        system = (
            "You create concise, exam-style flashcards. "
            "Return ONLY valid JSON: "
            '{"cards":[{"question":"...","answer":"...","hint":"optional",'
            '"difficulty":"easy|medium|hard","tags":["..."]}]}'
        )
        user = (
            f"Context:\n{joined_context}\n\n"
            f"Make exactly {n_cards} high-yield, fact-checked flashcards. "
            "Avoid fluff; prefer precise definitions, cause→effect, and contrasts."
        )
        raw = await self._fn(system, user)

        import json
        try:
            data = json.loads(raw.strip())
            cards = data.get("cards", [])
            if not isinstance(cards, list):
                raise ValueError("cards not a list")
        except Exception:
            cards = [{"question": "Summarize the main idea.", "answer": raw, "difficulty": "medium", "tags": []}]
        return cards

def get_card_generator() -> "CardGenerator":
    if LLM_PROVIDER == "groq":
        try:
            from groq import Groq
        except ImportError as e:
            raise ImportError(
                "Missing dependency 'groq'. Add `groq>=0.31.0` to requirements.txt and reinstall."
            ) from e

        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GROQ_API_KEY is not set. Put it in your environment or .env file (do NOT hardcode it)."
            )

        client = Groq(api_key=api_key)
        model = GEN_MODEL
        temperature = GEN_T

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


    if LLM_PROVIDER == "together":
        import openai
        openai.api_key = os.environ["TOGETHER_API_KEY"]
        openai.base_url = os.getenv("TOGETHER_BASE_URL", "https://api.together.xyz/v1")
        model = os.getenv("GEN_MODEL", "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo")
        temperature = float(os.getenv("GEN_T", "0.2"))

        async def _chat(system: str, user: str) -> str:
            r = openai.chat.completions.create(
                model=model,
                temperature=temperature,
                messages=[{"role":"system","content":system},{"role":"user","content":user}],
            )
            return r.choices[0].message.content

        return CardGenerator(_chat)

    if LLM_PROVIDER == "openai":
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        model = os.getenv("GEN_MODEL", "gpt-4o-mini")
        temperature = float(os.getenv("GEN_T", "0.2"))

        async def _chat(system: str, user: str) -> str:
            r = client.chat.completions.create(
                model=model,
                temperature=temperature,
                messages=[{"role":"system","content":system},{"role":"user","content":user}],
            )
            return r.choices[0].message.content

        return CardGenerator(_chat)

    async def _fake(system: str, user: str) -> str:
        return '{"cards":[{"question":"Demo?","answer":"Demo","difficulty":"easy","tags":["demo"]}]}'

    return CardGenerator(_fake)

__all__ = ["get_embedder", "get_card_generator", "EMBED_DIM"]
