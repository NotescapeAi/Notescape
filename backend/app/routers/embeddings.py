# app/routers/embeddings.py
from typing import Optional, List, Tuple
from fastapi import APIRouter, Query
from app.core.db import db_conn
from app.core.llm import get_embedder, EMBED_DIM

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])

def _vec_literal(vec: List[float]) -> str:
    return "[" + ",".join(str(x) for x in vec) + "]"

async def _insert_embeddings(pairs: List[Tuple[int, List[float]]]) -> int:
    if not pairs:
        return 0
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
    return len(pairs)

async def _fetch_missing_chunks(class_id: Optional[int], limit: Optional[int]) -> List[Tuple[int, str]]:
    q = """
      SELECT c.id, c.content
      FROM chunks c
      LEFT JOIN embeddings e ON e.chunk_id = c.id
      JOIN files f ON f.id = c.file_id
      WHERE e.chunk_id IS NULL
    """
    params: List[object] = []
    if class_id:
        q += " AND f.class_id = %s"
        params.append(class_id)
    q += " ORDER BY c.id"
    if limit:
        q += " LIMIT %s"
        params.append(limit)
    async with db_conn() as (conn, cur):
        await cur.execute(q, tuple(params))
        return await cur.fetchall()

@router.post("/build")
async def build_embeddings(
    class_id: Optional[int] = Query(default=None, description="Only build for this class"),
    limit: Optional[int] = Query(default=1000),
):
    rows = await _fetch_missing_chunks(class_id, limit)
    if not rows:
        return {"inserted": 0, "message": "No missing embeddings.", "class_id": class_id}
    ids = [cid for cid, _ in rows]
    txts = [t for _, t in rows]
    embedder = get_embedder()

    B = 64
    inserted = 0
    for i in range(0, len(txts), B):
        sub_ids = ids[i:i+B]
        sub_txts = txts[i:i+B]
        vecs = await embedder.embed_texts(sub_txts)
        await _insert_embeddings(list(zip(sub_ids, vecs)))
        inserted += len(sub_ids)

    return {"inserted": inserted, "class_id": class_id}
