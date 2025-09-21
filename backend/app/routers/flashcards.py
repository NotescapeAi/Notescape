# app/routers/flashcards.py
from typing import Optional, List, Tuple, Dict
from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field
from app.core.db import db_conn
from app.core.llm import get_embedder, get_card_generator, EMBED_DIM

# app/routers/flashcards.py
router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])


class EnsureEmbeddingsReq(BaseModel):
    limit: Optional[int] = Field(default=500)

class GenerateReq(BaseModel):
    class_id: int
    topic: Optional[str] = None
    top_k: int = Field(default=12, ge=1, le=100)
    n_cards: int = Field(default=10, ge=1, le=50)

class FlashcardOut(BaseModel):
    id: str
    class_id: int
    source_chunk_id: Optional[int]
    question: str
    answer: str
    hint: Optional[str] = None
    difficulty: Optional[str] = "medium"
    tags: List[str] = []

def _vec_literal(vec: List[float]) -> str:
    return "[" + ",".join(str(x) for x in vec) + "]"

@router.get("/ping")
async def ping():
    return {"status": "ok", "router": "flashcards"}

# ---------- LIST / DELETE ----------

@router.get("/{class_id}", response_model=List[FlashcardOut])
async def list_flashcards_for_class(class_id: int):
    q = """
      SELECT id::text, class_id, source_chunk_id, question, answer, hint, difficulty, tags
      FROM flashcards
      WHERE class_id = %s
      ORDER BY created_at DESC
    """
    async with db_conn() as (conn, cur):
        await cur.execute(q, (class_id,))
        rows = await cur.fetchall()
    return [
        FlashcardOut(
            id=r[0], class_id=r[1], source_chunk_id=r[2],
            question=r[3], answer=r[4], hint=r[5],
            difficulty=r[6] or "medium", tags=r[7] or []
        )
        for r in rows
    ]

@router.delete("/{card_id}", status_code=204)
async def delete_flashcard(card_id: str = Path(..., description="flashcards.id (UUID)")):
    async with db_conn() as (conn, cur):
        await cur.execute("DELETE FROM flashcards WHERE id::text=%s", (card_id,))
        await conn.commit()
    return

# ---------- EMBEDDINGS HELPERS ----------

async def _fetch_missing_chunks(limit: Optional[int]) -> List[Tuple[int, str]]:
    q = """
      SELECT fc.id, fc.content
      FROM file_chunks fc
      WHERE fc.chunk_vector IS NULL
      ORDER BY fc.id
    """
    params = ()
    if limit:
        q += " LIMIT %s"
        params = (limit,)
    async with db_conn() as (conn, cur):
        await cur.execute(q, params)
        return await cur.fetchall()

async def _insert_embeddings(pairs: List[Tuple[int, List[float]]]):
    if not pairs:
        return
    async with db_conn() as (conn, cur):
        for chunk_id, vec in pairs:
            await cur.execute(
                "UPDATE file_chunks SET chunk_vector=%s::vector WHERE id=%s",
                (_vec_literal(vec), chunk_id),
            )
        await conn.commit()

async def _pick_relevant_chunks(class_id: int, query_vec: List[float], top_k: int) -> List[Tuple[int, str]]:
    vec_lit = _vec_literal(query_vec)
    q = """
      SELECT fc.id, fc.content
      FROM file_chunks fc
      JOIN files f ON f.id = fc.file_id
      WHERE f.class_id = %s
        AND fc.chunk_vector IS NOT NULL
      ORDER BY fc.chunk_vector <=> %s::vector
      LIMIT %s
    """
    async with db_conn() as (conn, cur):
        await cur.execute(q, (class_id, vec_lit, top_k))
        return await cur.fetchall()

async def _insert_flashcards(class_id: int, cards: List[Dict], source_chunk_id: Optional[int]) -> List[str]:
    out_ids: List[str] = []
    async with db_conn() as (conn, cur):
        for c in cards:
            q = (c.get("question") or "").strip()
            a = (c.get("answer") or "").strip()
            if not q or not a:
                continue
            hint = c.get("hint")
            diff = c.get("difficulty") or "medium"
            tags = c.get("tags") or []
            await cur.execute("""
                INSERT INTO flashcards (class_id, source_chunk_id, question, answer, hint, difficulty, tags, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'llm')
                RETURNING id::text
            """, (class_id, source_chunk_id, q, a, hint, diff, tags))
            row = await cur.fetchone()
            out_ids.append(row[0])
        await conn.commit()
    return out_ids

# ---------- ROUTES ----------

@router.post("/ensure-embeddings")
async def ensure_embeddings(body: EnsureEmbeddingsReq):
    rows = await _fetch_missing_chunks(body.limit)
    if not rows:
        return {"inserted": 0, "message": "No missing embeddings."}
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
    return {"inserted": inserted}


@router.post("/generate/", response_model=List[FlashcardOut])
async def generate(req: GenerateReq):
    embedder = get_embedder()
    generator = get_card_generator()

    qtext = req.topic or "Create high-yield study flashcards for this class content."
    qvec = (await embedder.embed_texts([qtext]))[0]

    hits = await _pick_relevant_chunks(req.class_id, qvec, req.top_k)
    if not hits:
        raise HTTPException(status_code=404, detail="No chunks found for this class. Upload content first.")

    joined = "\n".join("• " + c[:1000] for _, c in hits)
    cards = await generator.generate(joined, req.n_cards)

    source_chunk_id = hits[0][0] if hits else None
    ids = await _insert_flashcards(req.class_id, cards, source_chunk_id)

    out: List[FlashcardOut] = []
    for i, c in zip(ids, cards):
        out.append(FlashcardOut(
            id=i,
            class_id=req.class_id,
            source_chunk_id=source_chunk_id,
            question=c.get("question", ""),
            answer=c.get("answer", ""),
            hint=c.get("hint"),
            difficulty=c.get("difficulty", "medium"),
            tags=c.get("tags") or [],
        ))
    return out
