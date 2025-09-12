# app/routers/embeddings.py
from typing import Optional, List, Tuple
from fastapi import APIRouter, Query
from app.core.db import db_conn
from app.core.llm import get_embedder

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])

def _vec_literal(vec: List[float]) -> str:
    return "[" + ",".join(str(x) for x in vec) + "]"

async def _fetch_missing_chunks(class_id: Optional[int], limit: Optional[int]) -> List[Tuple[int, str]]:
    q = """
      SELECT fc.id, fc.content
      FROM file_chunks fc
      JOIN files f ON f.id = fc.file_id
      WHERE fc.chunk_vector IS NULL
    """
    params: List[object] = []
    if class_id is not None:
        q += " AND f.class_id = %s"
        params.append(class_id)
    q += " ORDER BY fc.id"
    if limit is not None:
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

    ids  = [cid for cid, _ in rows]
    txts = [t   for _,   t in rows]
    embedder = get_embedder()

    B = 64
    inserted = 0
    async with db_conn() as (conn, cur):
        for i in range(0, len(txts), B):
            sub_ids  = ids[i:i+B]
            sub_txts = txts[i:i+B]
            vecs = await embedder.embed_texts(sub_txts)
            for chunk_id, vec in zip(sub_ids, vecs):
                await cur.execute(
                    "UPDATE file_chunks SET chunk_vector=%s::vector WHERE id=%s",
                    (_vec_literal(vec), chunk_id),
                )
            inserted += len(sub_ids)
        await conn.commit()

    return {"inserted": inserted, "class_id": class_id}
