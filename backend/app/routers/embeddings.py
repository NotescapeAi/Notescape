# app/routers/embeddings.py
from typing import Optional, List, Tuple
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from app.core.db import db_conn
from app.core.llm import get_embedder, EMBED_DIM

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])

@router.get("/ping")
async def ping():
    return {"status": "ok", "router": "embeddings"}

class BuildBody(BaseModel):
    batch_size: int = Field(default=64, ge=1, le=256)

def _vec_literal(vec: List[float]) -> str:
    return "[" + ",".join(str(x) for x in vec) + "]"

async def _missing_chunk_rows(class_id: int) -> List[Tuple[int, str]]:
    q = """
        SELECT c.id, c.content
        FROM chunks c
        JOIN files f ON f.id = c.file_id
        LEFT JOIN embeddings e ON e.chunk_id = c.id
        WHERE f.class_id = %s
          AND e.chunk_id IS NULL
        ORDER BY c.id
    """
    async with db_conn() as (conn, cur):
        await cur.execute(q, (class_id,))
        return await cur.fetchall()

async def _insert_embeddings(pairs: List[Tuple[int, List[float]]]):
    if not pairs:
        return
    async with db_conn() as (conn, cur):
        for chunk_id, vec in pairs:
            await cur.execute(
                """
                INSERT INTO embeddings (chunk_id, model, dim, vec)
                VALUES (%s, %s, %s, %s::vector)
                ON CONFLICT (chunk_id)
                DO UPDATE SET model=EXCLUDED.model, dim=EXCLUDED.dim, vec=EXCLUDED.vec
                """,
                (chunk_id, "auto", EMBED_DIM, _vec_literal(vec)),
            )
        await conn.commit()

@router.post("/build")
async def build_embeddings(body: BuildBody, class_id: int = Query(..., description="Class id")):
    rows = await _missing_chunk_rows(class_id)
    if not rows:
        return {"inserted": 0, "note": "No missing embeddings for this class."}

    embedder = get_embedder()
    B = body.batch_size
    inserted = 0
    for i in range(0, len(rows), B):
        batch = rows[i:i+B]
        ids = [cid for cid, _ in batch]
        txt = [c for _, c in batch]
        vecs = await embedder.embed_texts(txt)
        await _insert_embeddings(list(zip(ids, vecs)))
        inserted += len(batch)

    return {"inserted": inserted}
