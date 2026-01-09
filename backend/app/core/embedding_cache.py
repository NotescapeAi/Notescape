import hashlib
from typing import List, Optional

from app.core.cache import cache_get_json, cache_set_json
from app.core.llm import EMBED_PROVIDER, EMBED_MODEL, EMBED_DIM


def _embed_key(text: str) -> str:
    h = hashlib.sha256(text.encode("utf-8")).hexdigest()
    return f"emb:{EMBED_PROVIDER}:{EMBED_MODEL}:{EMBED_DIM}:{h}"


async def embed_texts_cached(embedder, texts: List[str], ttl_seconds: int = 86400) -> List[List[float]]:
    results: List[Optional[List[float]]] = [None] * len(texts)
    missing_texts: List[str] = []
    missing_idx: List[int] = []

    for i, t in enumerate(texts):
        key = _embed_key(t)
        cached = cache_get_json(key)
        if isinstance(cached, list) and cached:
            results[i] = cached
        else:
            missing_idx.append(i)
            missing_texts.append(t)

    if missing_texts:
        vecs = await embedder.embed_texts(missing_texts)
        for i, vec in zip(missing_idx, vecs):
            results[i] = vec
            cache_set_json(_embed_key(texts[i]), vec, ttl_seconds)

    return [r or [0.0] * EMBED_DIM for r in results]
