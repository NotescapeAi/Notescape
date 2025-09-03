import os
from typing import List, Tuple, Optional
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel, Field
from app.core.db import db_conn

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536

class BuildReq(BaseModel):
    batch_size: int = Field(default=64, ge=1, le=512)

def _vec_literal(vec: List[float]) -> str:
    return "[" + ",".join(str(float(x)) for x in vec) + "]"

def _fake_embed_text(text: str) -> List[float]:
    # Deterministic, no external libs, length = 1536.
    # Make 256-char histogram, normalize, then repeat to 1536.
    bins = [0.0] * 256
    for ch in text:
        bins[ord(ch) % 256] += 1.0
    s = sum(bins) or 1.0
    bins = [b / s for b in bins]  # normalize
    # repeat to 1536 (256 * 6)
    vec = (bins * (EMBED_DIM // 256))[:EMBED_DIM]
    return vec

def _use_fake() -> bool:
    return os.getenv("LLM_PROVIDER", "openai").lower() == "fake"

async def _embed_batch(texts: List[str]) -> List[List[float]]:
    if _use_fake():
        return [_fake_embed_text(t) for t in texts]
    else:
        from openai import OpenAI
        client = OpenAI()
        resp = client.embeddings.create(model=EMBED_MODEL, input=texts)
        return [d.embedding for d in resp.data]

@router.get("/ping")
async def ping():
    return {"status": "ok", "router": "embeddings"}

@router.post("/build")
async def build(class_id: int = Query(...), body: BuildReq = None):
    # Find chunks for this class that are missing embeddings
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT c.id, c.content
            FROM chunks c
            JOIN files f ON f.id = c.file_id
            LEFT JOIN embeddings e ON e.chunk_id = c.id
            WHERE f.class_id = %s AND e.chunk_id IS NULL
            ORDER BY c.id
            """,
            (class_id,),
        )
        rows: List[Tuple[int, str]] = await cur.fetchall()

    if not rows:
        return {"inserted": 0, "message": "No missing embeddings for this class."}

    BATCH = (body.batch_size if body else 64)
    inserted = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i+BATCH]
        ids = [cid for cid, _ in batch]
        texts = [txt for _, txt in batch]
        vecs = await _embed_batch(texts)
        async with db_conn() as (conn, cur):
            for cid, vec in zip(ids, vecs):
                await cur.execute(
                    """
                    INSERT INTO embeddings (chunk_id, model, dim, vec)
                    VALUES (%s, %s, %s, %s::vector)
                    ON CONFLICT (chunk_id)
                    DO UPDATE SET model=EXCLUDED.model, dim=EXCLUDED.dim, vec=EXCLUDED.vec
                    """,
                    (cid, EMBED_MODEL, EMBED_DIM, _vec_literal(vec)),
                )
            await conn.commit()
        inserted += len(ids)

    return {"inserted": inserted}
