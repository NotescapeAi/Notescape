from typing import Optional, List, Tuple, Dict  # Importing Tuple here
from fastapi import APIRouter, HTTPException, Path, Query, Depends
from pydantic import BaseModel, Field
from app.core.db import db_conn
from app.core.llm import get_embedder, get_card_generator
from app.core.embedding_cache import embed_texts_cached
from app.dependencies import get_request_user_uid
import json
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])


async def _ensure_class_owner(class_id: int, user_id: str):
    if user_id == "dev-user":
        return
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT 1 FROM classes WHERE id=%s AND owner_uid=%s",
            (class_id, user_id),
        )
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Class not found")


async def _ensure_file_in_class(file_id: str, class_id: int):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT 1 FROM files WHERE id=%s AND class_id=%s",
            (file_id, class_id),
        )
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="File not found in class")

class EnsureEmbeddingsReq(BaseModel):
    limit: Optional[int] = Field(default=500)

class GenerateReq(BaseModel):
    class_id: int
    file_ids: List[str] = Field(default_factory=list)
    topic: Optional[str] = None
    style: Optional[str] = Field(default="mixed", pattern="^(mixed|definitions|conceptual|qa)$")
    top_k: int = Field(default=12, ge=1, le=100)
    n_cards: int = Field(default=24, ge=1, le=50)
    difficulty: Optional[str] = Field(default=None, pattern="^(easy|medium|hard)$")
    page_start: Optional[int] = Field(default=None, ge=1)
    page_end: Optional[int] = Field(default=None, ge=1)

class FlashcardOut(BaseModel):
    id: str
    class_id: int
    file_id: Optional[str] = None
    source_chunk_id: Optional[int]
    question: str
    answer: str
    hint: Optional[str] = None
    difficulty: Optional[str] = "medium"
    tags: List[str] = []
    due_at: Optional[str] = None
    repetitions: Optional[int] = None
    ease_factor: Optional[float] = None
    interval_days: Optional[int] = None
    state: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

def _vec_literal(vec: List[float]) -> str:
    return "[" + ",".join(str(x) for x in vec) + "]"

@router.get("/ping")
async def ping():
    return {"status": "ok", "router": "flashcards"}

# ---------- LIST / DELETE ----------

def _maybe_expand_legacy_jsonblob(
    row: Tuple[str, int, Optional[int], str, str, Optional[str], Optional[str], Optional[List[str]]]
) -> Optional[List[FlashcardOut]]:  # Fixed Tuple import
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

class ReviewReq(BaseModel):
    rating: Optional[str] = Field(default=None, pattern="^(again|hard|good|easy)$")
    confidence: Optional[int] = Field(default=None, ge=1, le=5)


class ManualCreateReq(BaseModel):
    class_id: int
    question: str
    answer: str
    file_id: Optional[str] = None
    hint: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    difficulty: Optional[str] = Field(default="medium", pattern="^(easy|medium|hard)$")


class ManualUpdateReq(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    file_id: Optional[str] = None
    hint: Optional[str] = None
    tags: Optional[List[str]] = None
    difficulty: Optional[str] = Field(default=None, pattern="^(easy|medium|hard)$")
    reset_progress: bool = False


def _sm2_update(ease: float, interval: int, reps: int, lapses: int, rating: str):
    now = datetime.now(timezone.utc)
    if rating == "again":
        ease = max(1.3, ease - 0.2)
        reps = 0
        lapses += 1
        interval = 0
        due_at = now + timedelta(minutes=10)
        state = "learning"
    elif rating == "hard":
        ease = max(1.3, ease - 0.15)
        reps += 1
        interval = 1 if interval == 0 else max(1, round(interval * 1.2))
        due_at = now + timedelta(days=interval)
        state = "review"
    elif rating == "good":
        reps += 1
        if reps == 1:
            interval = 1
        elif reps == 2:
            interval = 3
        else:
            interval = max(1, round(interval * ease))
        due_at = now + timedelta(days=interval)
        state = "review"
    else:  # easy
        ease = min(2.8, ease + 0.15)
        reps += 1
        if reps == 1:
            interval = 1
        elif reps == 2:
            interval = 4
        else:
            interval = max(1, round(interval * ease * 1.3))
        due_at = now + timedelta(days=interval)
        state = "review"

    return {
        "ease_factor": ease,
        "interval_days": interval,
        "repetitions": reps,
        "lapses": lapses,
        "due_at": due_at,
        "state": state,
    }


@router.get("/due")
async def list_due_cards(
    class_id: int,
    file_id: Optional[str] = None,
    limit: int = 30,
    user_id: str = Depends(get_request_user_uid),
):
    await _ensure_class_owner(class_id, user_id)
    q = """
      SELECT f.id::text, f.class_id, f.file_id::text, f.question, f.answer, f.hint, f.difficulty,
             s.ease_factor, s.interval_days, s.repetitions, s.lapses, s.due_at, s.state
      FROM flashcards f
      LEFT JOIN sr_card_state s ON s.card_id = f.id AND s.user_id = %s
      WHERE f.class_id = %s
        AND (%s::uuid IS NULL OR f.file_id = %s::uuid)
        AND f.deleted_at IS NULL
        AND (s.due_at IS NULL OR s.due_at <= now())
      ORDER BY s.due_at NULLS FIRST, f.created_at ASC
      LIMIT %s
    """
    async with db_conn() as (conn, cur):
        await cur.execute(q, (user_id, class_id, file_id, file_id, limit))
        rows = await cur.fetchall()

    out = []
    for r in rows:
        out.append(
            {
                "id": r[0],
                "class_id": r[1],
                "file_id": r[2],
                "question": r[3],
                "answer": r[4],
                "hint": r[5],
                "difficulty": r[6],
                "ease_factor": r[7] or 2.5,
                "interval_days": r[8] or 0,
                "repetitions": r[9] or 0,
                "lapses": r[10] or 0,
                "due_at": r[11].isoformat() if r[11] else None,
                "state": r[12] or "new",
            }
        )
    return out


@router.post("")
async def create_manual_flashcard(payload: ManualCreateReq, user_id: str = Depends(get_request_user_uid)):
    await _ensure_class_owner(payload.class_id, user_id)
    if payload.file_id:
        await _ensure_file_in_class(payload.file_id, payload.class_id)

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            INSERT INTO flashcards (class_id, file_id, question, answer, hint, difficulty, tags, created_by, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
            RETURNING id::text
            """,
            (
                payload.class_id,
                payload.file_id,
                payload.question.strip(),
                payload.answer.strip(),
                payload.hint,
                payload.difficulty or "medium",
                payload.tags or [],
                user_id,
            ),
        )
        row = await cur.fetchone()
        card_id = row[0]
        await cur.execute(
            """
            INSERT INTO sr_card_state (card_id, user_id, due_at, repetitions, interval_days, ease_factor, state, last_review)
            VALUES (%s, %s, now(), 0, 0, 2.5, 'new', now())
            ON CONFLICT (card_id, user_id) DO NOTHING
            """,
            (card_id, user_id),
        )
        await conn.commit()

    return {"id": card_id}


@router.put("/{card_id}")
async def update_flashcard(
    card_id: str,
    payload: ManualUpdateReq,
    user_id: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT class_id FROM flashcards WHERE id::text=%s AND deleted_at IS NULL",
            (card_id,),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Card not found")
        class_id = row[0]
        await _ensure_class_owner(class_id, user_id)

        if payload.file_id:
            await _ensure_file_in_class(payload.file_id, class_id)

        fields = []
        values: List[object] = []
        if payload.question is not None:
            fields.append("question=%s")
            values.append(payload.question.strip())
        if payload.answer is not None:
            fields.append("answer=%s")
            values.append(payload.answer.strip())
        if payload.hint is not None:
            fields.append("hint=%s")
            values.append(payload.hint)
        if payload.tags is not None:
            fields.append("tags=%s")
            values.append(payload.tags)
        if payload.difficulty is not None:
            fields.append("difficulty=%s")
            values.append(payload.difficulty)
        if payload.file_id is not None:
            fields.append("file_id=%s")
            values.append(payload.file_id)

        fields.append("updated_at=now()")
        values.append(card_id)

        await cur.execute(
            f"UPDATE flashcards SET {', '.join(fields)} WHERE id::text=%s",
            tuple(values),
        )

        if payload.reset_progress:
            await cur.execute(
                """
                INSERT INTO sr_card_state (card_id, user_id, due_at, repetitions, interval_days, ease_factor, state, last_review)
                VALUES (%s, %s, now(), 0, 0, 2.5, 'new', now())
                ON CONFLICT (card_id, user_id) DO UPDATE
                SET due_at=now(),
                    repetitions=0,
                    interval_days=0,
                    ease_factor=2.5,
                    state='new',
                    last_review=now()
                """,
                (card_id, user_id),
            )

        await conn.commit()

    return {"ok": True}


@router.post("/{card_id}/review")
async def review_card(
    card_id: str,
    payload: ReviewReq,
    user_id: str = Depends(get_request_user_uid),
):
    if not payload.rating and payload.confidence is None:
        raise HTTPException(status_code=400, detail="rating or confidence is required")
    if payload.confidence is not None:
        if payload.confidence <= 1:
            rating = "again"
        elif payload.confidence == 2:
            rating = "hard"
        elif payload.confidence == 3:
            rating = "good"
        else:
            rating = "easy"
    else:
        rating = payload.rating or "good"

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT f.class_id
            FROM flashcards f
            WHERE f.id::text=%s AND f.deleted_at IS NULL
            """,
            (card_id,),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Card not found")
        await _ensure_class_owner(row[0], user_id)

        await cur.execute(
            "SELECT ease_factor, interval_days, repetitions, lapses FROM sr_card_state WHERE card_id=%s AND user_id=%s",
            (card_id, user_id),
        )
        row = await cur.fetchone()

        if row:
            ease, interval, reps, lapses = row
        else:
            ease, interval, reps, lapses = 2.5, 0, 0, 0

        updated = _sm2_update(float(ease), int(interval), int(reps), int(lapses), rating)

        await cur.execute(
            """
            INSERT INTO sr_card_state (card_id, user_id, ease_factor, interval_days, repetitions, lapses, due_at, state, last_review)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (card_id, user_id) DO UPDATE
            SET ease_factor=EXCLUDED.ease_factor,
                interval_days=EXCLUDED.interval_days,
                repetitions=EXCLUDED.repetitions,
                lapses=EXCLUDED.lapses,
                due_at=EXCLUDED.due_at,
                state=EXCLUDED.state,
                last_review=now()
            """,
            (
                card_id,
                user_id,
                updated["ease_factor"],
                updated["interval_days"],
                updated["repetitions"],
                updated["lapses"],
                updated["due_at"],
                updated["state"],
            ),
        )
        await conn.commit()

    return {"ok": True, "state": updated}


@router.get("/progress")
async def flashcard_progress(
    class_id: int,
    file_id: Optional[str] = None,
    user_id: str = Depends(get_request_user_uid),
):
    await _ensure_class_owner(class_id, user_id)
    q = """
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE s.due_at IS NULL OR s.due_at <= now()) AS due_now,
        COUNT(*) FILTER (WHERE s.due_at IS NULL OR s.due_at <= date_trunc('day', now()) + interval '1 day') AS due_today,
        COUNT(*) FILTER (WHERE COALESCE(s.repetitions, 0) = 0) AS learning
      FROM flashcards f
      LEFT JOIN sr_card_state s ON s.card_id = f.id AND s.user_id = %s
      WHERE f.class_id = %s
        AND (%s::uuid IS NULL OR f.file_id = %s::uuid)
        AND f.deleted_at IS NULL
    """
    async with db_conn() as (conn, cur):
        await cur.execute(q, (user_id, class_id, file_id, file_id))
        row = await cur.fetchone()
    return {"total": row[0], "due_now": row[1], "due_today": row[2], "learning": row[3]}

# ---------- EMBEDDINGS HELPERS ----------

async def _fetch_missing_chunks(class_id: int, limit: Optional[int]) -> List[Tuple[int, str]]:  # (chunk_id, content)
    q = """
      SELECT fc.id, fc.content
      FROM file_chunks fc
      JOIN files f ON f.id = fc.file_id
      WHERE fc.chunk_vector IS NULL
        AND f.class_id = %s
      ORDER BY fc.id
    """
    params: List[object] = [class_id]
    if limit:
        q += " LIMIT %s"
        params.append(limit)
    async with db_conn() as (conn, cur):
        await cur.execute(q, tuple(params))
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

async def _pick_relevant_chunks(
    class_id: int,
    query_vec: List[float],
    top_k: int,
    file_ids: List[str],
    page_start: Optional[int],
    page_end: Optional[int],
) -> List[Tuple[int, str, str]]:
    vec_lit = _vec_literal(query_vec)
    q = """
      SELECT fc.id, fc.content, f.id::text
      FROM file_chunks fc
      JOIN files f ON f.id = fc.file_id
      WHERE f.class_id = %s
        AND fc.chunk_vector IS NOT NULL
        AND (cardinality(%s::uuid[]) = 0 OR f.id = ANY(%s::uuid[]))
        AND (%s::int IS NULL OR fc.page_end >= %s::int)
        AND (%s::int IS NULL OR fc.page_start <= %s::int)
      ORDER BY fc.chunk_vector <=> %s::vector
      LIMIT %s
    """
    async with db_conn() as (conn, cur):
        await cur.execute(q, (class_id, file_ids, file_ids, page_start, page_start, page_end, page_end, vec_lit, top_k))
        return await cur.fetchall()

async def _insert_flashcards(
    class_id: int,
    file_id: Optional[str],
    cards: List[Dict],
    source_chunk_id: Optional[int],
    created_by: str,
) -> List[str]:
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
                INSERT INTO flashcards (class_id, file_id, source_chunk_id, question, answer, hint, difficulty, tags, created_by, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                RETURNING id::text
                """,
                (class_id, file_id, source_chunk_id, q, a, hint, diff, tags, created_by),
            )
            row = await cur.fetchone()
            card_id = row[0]
            out_ids.append(card_id)
            if created_by:
                await cur.execute(
                    """
                    INSERT INTO sr_card_state (card_id, user_id, due_at, repetitions, interval_days, ease_factor, state, last_review)
                    VALUES (%s, %s, now(), 0, 0, 2.5, 'new', now())
                    ON CONFLICT (card_id, user_id) DO NOTHING
                    """,
                    (card_id, created_by),
                )
        await conn.commit()
    return out_ids

# ---------- ROUTES ----------

@router.post("/ensure-embeddings/{class_id}")
async def ensure_embeddings(class_id: int, body: EnsureEmbeddingsReq):
    rows = await _fetch_missing_chunks(class_id, body.limit)
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
        vecs = await embed_texts_cached(embedder, sub_txts, ttl_seconds=86400)
        await _insert_embeddings(list(zip(sub_ids, vecs)))
        inserted += len(sub_ids)
    return {"inserted": inserted}

@router.post("/generate", response_model=List[FlashcardOut])   # <-- no trailing slash
async def generate(req: GenerateReq, user_id: str = Depends(get_request_user_uid)):
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
    await _ensure_class_owner(req.class_id, user_id)
    if not req.file_ids:
        raise HTTPException(status_code=400, detail="file_ids is required")

    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT id::text FROM files WHERE class_id=%s AND id = ANY(%s::uuid[])",
            (req.class_id, req.file_ids),
        )
        valid_ids = [r[0] for r in await cur.fetchall()]

    if not valid_ids:
        raise HTTPException(status_code=404, detail="No files found for this class scope.")

    effective_top_k = max(req.top_k, min(60, req.n_cards * 2))
    qvec = (await embed_texts_cached(embedder, [qtext]))[0]
    hits = await _pick_relevant_chunks(req.class_id, qvec, effective_top_k, valid_ids, req.page_start, req.page_end)
    if not hits:
        raise HTTPException(status_code=404, detail="No chunks found for this class. Upload content first.")

    # Make a few alternative contexts to help reach the target count
    contexts: List[str] = []
    joined_all = "\n".join("- " + c[:1000] for _, c, _ in hits)
    contexts.append(joined_all)
    if len(hits) > 4:
        half = len(hits) // 2
        contexts.append("\n".join("- " + c[:1000] for _, c, _ in hits[:half]))
        contexts.append("\n".join("- " + c[:1000] for _, c, _ in hits[half:]))

    target = max(1, min(50, req.n_cards or 24))
    collected: List[Dict] = []
    seen_q = set()

    attempts = 0
    # Try a few rounds until we reach target
    while len(collected) < target and attempts < 6:
        need = target - len(collected)
        ctx = contexts[attempts % len(contexts)]
        batch = await generator.generate(ctx, need, req.style or "mixed")
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
    if len(collected) < target:
        raise HTTPException(
            status_code=500,
            detail=f"Card generation returned {len(collected)} cards (target {target}). Please retry.",
        )

    # trim/pad to exact target (pad is not needed because we loop above)
    if len(collected) > target:
        collected = collected[:target]

    source_chunk_id = hits[0][0] if hits else None
    source_file_id = hits[0][2] if hits else (valid_ids[0] if valid_ids else None)
    ids = await _insert_flashcards(req.class_id, source_file_id, collected, source_chunk_id, created_by=user_id)

    out: List[FlashcardOut] = []
    for i, c in zip(ids, collected):
        out.append(
            FlashcardOut(
                id=i,
                class_id=req.class_id,
                file_id=source_file_id,
                source_chunk_id=source_chunk_id,
                question=c.get("question", ""),
                answer=c.get("answer", ""),
                hint=c.get("hint"),
                difficulty=c.get("difficulty", "medium"),
                tags=c.get("tags") or [],
            )
        )
    return out


@router.get("/{class_id}", response_model=List[FlashcardOut])
async def list_flashcards_for_class(
    class_id: int,
    difficulty: Optional[str] = Query(default=None, pattern="^(easy|medium|hard)$"),
    file_id: Optional[str] = Query(default=None),
    user_id: str = Depends(get_request_user_uid),
):
    await _ensure_class_owner(class_id, user_id)
    q = """
      SELECT f.id::text, f.class_id, f.file_id::text, f.source_chunk_id, f.question, f.answer, f.hint, f.difficulty, f.tags,
             s.due_at, s.repetitions, s.ease_factor, s.interval_days, s.state, f.created_at, f.updated_at
      FROM flashcards f
      LEFT JOIN sr_card_state s ON s.card_id = f.id AND s.user_id = %s
      WHERE f.class_id = %s
        AND (%s::uuid IS NULL OR f.file_id = %s::uuid)
        AND f.deleted_at IS NULL
      ORDER BY f.created_at DESC
    """
    async with db_conn() as (conn, cur):
        await cur.execute(q, (user_id, class_id, file_id, file_id))
        rows = await cur.fetchall()

    out: List[FlashcardOut] = []
    for r in rows:
        expanded = _maybe_expand_legacy_jsonblob((r[0], r[1], r[3], r[4], r[5], r[6], r[7], r[8]))
        if expanded:
            out.extend(expanded)
        else:
            out.append(
                FlashcardOut(
                    id=r[0],
                    class_id=r[1],
                    file_id=r[2],
                    source_chunk_id=r[3],
                    question=r[4],
                    answer=r[5],
                    hint=r[6],
                    difficulty=r[7] or "medium",
                    tags=r[8] or [],
                    due_at=r[9].isoformat() if r[9] else None,
                    repetitions=r[10],
                    ease_factor=r[11],
                    interval_days=r[12],
                    state=r[13],
                    created_at=r[14].isoformat() if r[14] else None,
                    updated_at=r[15].isoformat() if r[15] else None,
                )
            )

    if difficulty:
        out = [c for c in out if (c.difficulty or "medium") == difficulty]
    return out


@router.delete("/{card_id}", status_code=204)
async def delete_flashcard(
    card_id: str = Path(..., description="flashcards.id (UUID)"),
    user_id: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT class_id FROM flashcards WHERE id::text=%s AND deleted_at IS NULL",
            (card_id,),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Card not found")
        await _ensure_class_owner(row[0], user_id)
        await cur.execute(
            "UPDATE flashcards SET deleted_at=now(), updated_at=now() WHERE id::text=%s",
            (card_id,),
        )
        await conn.commit()
    return
