# backend/routes_embeddings.py
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.engine import Connection
from openai import OpenAI

from .db import engine, get_db

EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536
client = OpenAI()  # needs OPENAI_API_KEY in env

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])

def _embed_texts(texts: list[str]) -> list[list[float]]:
    r = client.embeddings.create(model=EMBED_MODEL, input=texts)
    return [d.embedding for d in r.data]

@router.post("/build")
def build_embeddings(class_id: int, db=Depends(get_db)):
    with engine.connect() as conn:  # type: Connection
        rows = conn.execute(text("""
            SELECT c.id, c.content
            FROM chunks c
            JOIN files f ON f.id = c.file_id
            WHERE f.class_id = :cid
              AND NOT EXISTS (SELECT 1 FROM embeddings e WHERE e.chunk_id = c.id)
            ORDER BY c.id
        """), {"cid": class_id}).mappings().all()

        if not rows:
            return {"status": "noop", "message": "No missing embeddings."}

        BATCH = 64
        total = 0
        for i in range(0, len(rows), BATCH):
            batch = rows[i:i+BATCH]
            vecs = _embed_texts([r["content"] for r in batch])
            data = [
                {
                    "chunk_id": r["id"],
                    "model": EMBED_MODEL,
                    "dim": EMBED_DIM,
                    "vec": vec
                } for r, vec in zip(batch, vecs)
            ]
            conn.execute(text("""
                INSERT INTO embeddings (chunk_id, model, dim, vec)
                VALUES (:chunk_id, :model, :dim, :vec)
                ON CONFLICT (chunk_id)
                  DO UPDATE SET model=EXCLUDED.model, dim=EXCLUDED.dim, vec=EXCLUDED.vec
            """), data)
            conn.commit()
            total += len(batch)

        return {"status": "ok", "embedded": total}
