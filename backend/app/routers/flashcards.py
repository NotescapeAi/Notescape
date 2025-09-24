from typing import Optional, List, Tuple, Dict
from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field
from app.core.db import db_conn
from app.core.llm import get_embedder, get_card_generator
import json

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])

class EnsureEmbeddingsReq(BaseModel):
    limit: Optional[int] = Field(default=500)

class GenerateReq(BaseModel):
    class_id: int
    topic: Optional[str] = None
    top_k: int = Field(default=12, ge=1, le=100)
    # default target count if the client does not send n_cards
    n_cards: int = Field(default=24, ge=1, le=50)
    # force all generated cards to a single difficulty if provided
    difficulty: Optional[str] = Field(default=None, pattern="^(easy|medium|hard)$")

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

def _maybe_expand_legacy_jsonblob(
    row: Tuple[str, int, Optional[int], str, str, Optional[str], Optional[str], Optional[List[str]]]
) -> Optional[List[FlashcardOut]]:
    """
    Older rows sometimes saved one 'summary' card whose *answer* is a JSON blob:
      {"cards":[{question,answer,hint,difficulty,tags}, ...]}
    Expand them on read so the UI shows individual cards.
    """
    _id, _class_id, _src_id, question, answer, hint, difficulty, tags = row
    if not isinstance(answer, str) or '"cards"' not in answer:
        return None
    try:
        data = json.loads(answer)
        cards = data.get("cards")
        if not isinstance(cards, list):
            return None
        out: List[FlashcardOut] = []
        for i, c in enumerate(cards):
            out.append(
                FlashcardOut(
                    id=f"legacy-{_id}-{i}",
                    class_id=_class_id,
                    source_chunk_id=_src_id,
                    question=str(c.get("question") or question or "").strip(),
                    answer=str(c.get("answer") or "").strip(),
                    hint=(c.get("hint") if c.get("hint") not in (None, "", "null") else None),
                    difficulty=(c.get("difficulty") or difficulty or "medium"),
                    tags=list(c.get("tags") or []),
                )
            )
        return out
    except Exception:
        return None

@router.get("/{class_id}", response_model=List[FlashcardOut])
async def list_flashcards_for_class(
    class_id: int,
    difficulty: Optional[str] = Query(default=None, pattern="^(easy|medium|hard)$"),
):
    q = """
      SELECT id::text, class_id, source_chunk_id, question, answer, hint, difficulty, tags
      FROM flashcards
      WHERE class_id = %s
      ORDER BY created_at DESC
    """
    async with db_conn() as (conn, cur):
        await cur.execute(q, (class_id,))
        rows = await cur.fetchall()

    out: List[FlashcardOut] = []
    for r in rows:
        expanded = _maybe_expand_legacy_jsonblob(r)
        if expanded:
            out.extend(expanded)
        else:
            out.append(
                FlashcardOut(
                    id=r[0],
                    class_id=r[1],
                    source_chunk_id=r[2],
                    question=r[3],
                    answer=r[4],
                    hint=r[5],
                    difficulty=r[6] or "medium",
                    tags=r[7] or [],
                )
            )

    if difficulty:
        out = [c for c in out if (c.difficulty or "medium") == difficulty]
    return out

@router.delete("/{card_id}", status_code=204)
async def delete_flashcard(card_id: str = Path(..., description="flashcards.id (UUID)")):
    async with db_conn() as (conn, cur):
        await cur.execute("DELETE FROM flashcards WHERE id::text=%s", (card_id,))
        await conn.commit()
    return

# ---------- EMBEDDINGS HELPERS ----------

async def _fetch_missing_chunks(limit: Optional[int]) -> List[Tuple[int, str]]:  # (chunk_id, content)
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
            await cur.execute(
                """
                INSERT INTO flashcards (class_id, source_chunk_id, question, answer, hint, difficulty, tags, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'llm')
                RETURNING id::text
                """,
                (class_id, source_chunk_id, q, a, hint, diff, tags),
            )
            row = await cur.fetchone()
            out_ids.append(row[0])
        await conn.commit()
    return out_ids

# ---------- ROUTES ----------

@router.post("/ensure-embeddings/{class_id}")
async def ensure_embeddings(class_id: int, body: EnsureEmbeddingsReq):
    rows = await _fetch_missing_chunks(body.limit)
    if not rows:
        return {"inserted": 0, "message": "No missing embeddings."}
    ids = [cid for cid, _ in rows]
    txts = [t for _, t in rows]
    embedder = get_embedder()
    B = 64
    inserted = 0
    for i in range(0, len(txts), B):
        sub_ids = ids[i : i + B]
        sub_txts = txts[i : i + B]
        vecs = await embedder.embed_texts(sub_txts)
        await _insert_embeddings(list(zip(sub_ids, vecs)))
        inserted += len(sub_ids)
    return {"inserted": inserted}

@router.post("/generate", response_model=List[FlashcardOut])   # <-- no trailing slash
async def generate(req: GenerateReq):
    """
    Generate up to n_cards, enforcing:
    - exact target count (we reprompt until filled, then truncate),
    - single difficulty if provided,
    - de-duplication by question text.
    """
    embedder = get_embedder()
    generator = get_card_generator()

    # --- Retrieval
    qtext = req.topic or "Create high-yield study flashcards for this class content."
    qvec = (await embedder.embed_texts([qtext]))[0]
    hits = await _pick_relevant_chunks(req.class_id, qvec, req.top_k)
    if not hits:
        raise HTTPException(status_code=404, detail="No chunks found for this class. Upload content first.")

    # Make a few alternative contexts to help reach the target count
    contexts: List[str] = []
    joined_all = "\n".join("• " + c[:1000] for _, c in hits)
    contexts.append(joined_all)
    if len(hits) > 4:
        half = len(hits) // 2
        contexts.append("\n".join("• " + c[:1000] for _, c in hits[:half]))
        contexts.append("\n".join("• " + c[:1000] for _, c in hits[half:]))

    target = max(1, min(50, req.n_cards or 24))
    collected: List[Dict] = []
    seen_q = set()

    attempts = 0
    # Try a few rounds until we reach target
    while len(collected) < target and attempts < 4:
        need = target - len(collected)
        ctx = contexts[attempts % len(contexts)]
        batch = await generator.generate(ctx, need)
        for c in batch or []:
            q = (c.get("question") or "").strip()
            a = (c.get("answer") or "").strip()
            if not q or not a or q in seen_q:
                continue
            if req.difficulty:
                c["difficulty"] = req.difficulty
            collected.append(c)
            seen_q.add(q)
        attempts += 1

    if not collected:
        raise HTTPException(status_code=500, detail="Card generation returned no usable cards.")

    # trim/pad to exact target (pad is not needed because we loop above)
    if len(collected) > target:
        collected = collected[:target]

    source_chunk_id = hits[0][0] if hits else None
    ids = await _insert_flashcards(req.class_id, collected, source_chunk_id)

    out: List[FlashcardOut] = []
    for i, c in zip(ids, collected):
        out.append(
            FlashcardOut(
                id=i,
                class_id=req.class_id,
                source_chunk_id=source_chunk_id,
                question=c.get("question", ""),
                answer=c.get("answer", ""),
                hint=c.get("hint"),
                difficulty=c.get("difficulty", "medium"),
                tags=c.get("tags") or [],
            )
        )
    return out
