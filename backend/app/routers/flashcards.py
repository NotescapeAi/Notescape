from datetime import datetime, timezone
import json
import logging
import uuid
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Path, Query, Depends
from pydantic import BaseModel, Field

from app.core.db import db_conn
from app.core.embedding_cache import embed_texts_cached
from app.core.llm import get_embedder
from app.dependencies import get_request_user_uid
from app.lib.flashcard_generation import insert_flashcards, pick_relevant_chunks, vec_literal
from app.lib.study_analytics import apply_study_review
from app.lib.tags import normalize_tag_names, sync_flashcard_tags

log = logging.getLogger("uvicorn.error")
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

_mastery_schema_checked = False


async def _ensure_mastery_schema():
    global _mastery_schema_checked
    if _mastery_schema_checked:
        return
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS mastery_card_state (
              card_id UUID NOT NULL,
              user_id TEXT NOT NULL,
              mastery_level INT NOT NULL DEFAULT 0,
              review_count INT NOT NULL DEFAULT 0,
              consecutive_good INT NOT NULL DEFAULT 0,
              five_count INT NOT NULL DEFAULT 0,
              lapses INT NOT NULL DEFAULT 0,
              mastered BOOLEAN NOT NULL DEFAULT FALSE,
              last_reviewed TIMESTAMPTZ,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              PRIMARY KEY (card_id, user_id)
            )
            """
        )
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS mastery_session_queue (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id TEXT NOT NULL,
              class_id INT NOT NULL,
              card_order JSONB NOT NULL DEFAULT '[]'::jsonb,
              current_index INT NOT NULL DEFAULT 0,
              started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              ended_at TIMESTAMPTZ
            )
            """
        )
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS mastery_review_events (
              id BIGSERIAL PRIMARY KEY,
              user_id TEXT NOT NULL,
              card_id UUID NOT NULL,
              rating INT NOT NULL,
              response_time_ms INT,
              session_id UUID NOT NULL REFERENCES mastery_session_queue(id) ON DELETE CASCADE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await cur.execute(
            "CREATE INDEX IF NOT EXISTS mastery_session_user_idx ON mastery_session_queue (user_id, class_id, last_interaction_at DESC)"
        )
        await cur.execute(
            "CREATE INDEX IF NOT EXISTS mastery_event_user_idx ON mastery_review_events (user_id, created_at DESC)"
        )
        await conn.commit()
    _mastery_schema_checked = True

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

class FlashcardJobOut(BaseModel):
    job_id: str
    deck_id: int
    status: str
    progress: int
    correlation_id: Optional[str] = None
    error_message: Optional[str] = None
    created_at: Optional[str] = None


def _job_from_row(row: Tuple) -> FlashcardJobOut:
    correlation = row[4]
    return FlashcardJobOut(
        job_id=row[0],
        deck_id=row[1],
        status=row[2],
        progress=row[3],
        correlation_id=str(correlation) if correlation else None,
        error_message=row[5],
        created_at=row[6].isoformat() if row[6] else None,
    )

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
    response_time_ms: Optional[int] = Field(default=None, ge=0)


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


class MasteryStartReq(BaseModel):
    class_id: int
    file_ids: Optional[List[str]] = None


class MasteryReviewReq(BaseModel):
    card_id: str
    rating: int = Field(ge=1, le=5)
    response_time_ms: Optional[int] = Field(default=None, ge=0)


def _mastery_offset(rating: int) -> int:
    return {1: 2, 2: 4, 3: 8, 4: 15}.get(rating, 0)


def _mastery_level_from_rating(rating: int, prev: int, mastered: bool) -> int:
    if mastered:
        return 100
    return max(prev, rating * 20)


async def _mastery_stats(
    cur, user_id: str, class_id: int, file_id: Optional[str] = None
) -> Dict[str, int]:
    await cur.execute(
        """
        SELECT COUNT(*) FROM flashcards
        WHERE class_id=%s AND deleted_at IS NULL
          AND (%s::uuid IS NULL OR file_id=%s::uuid)
        """,
        (class_id, file_id, file_id),
    )
    total = (await cur.fetchone())[0]
    await cur.execute(
        """
        SELECT COUNT(*)
        FROM mastery_card_state s
        JOIN flashcards f ON f.id = s.card_id
        WHERE s.user_id=%s AND s.mastered=true AND f.class_id=%s AND f.deleted_at IS NULL
          AND (%s::uuid IS NULL OR f.file_id=%s::uuid)
        """,
        (user_id, class_id, file_id, file_id),
    )
    mastered = (await cur.fetchone())[0]
    await cur.execute(
        """
        SELECT COALESCE(AVG(COALESCE(s.mastery_level, 0)), 0)
        FROM flashcards f
        LEFT JOIN mastery_card_state s ON s.card_id = f.id AND s.user_id=%s
        WHERE f.class_id=%s AND f.deleted_at IS NULL
          AND (%s::uuid IS NULL OR f.file_id=%s::uuid)
        """,
        (user_id, class_id, file_id, file_id),
    )
    avg_mastery = float((await cur.fetchone())[0] or 0)
    mastery_percent = int(round(avg_mastery))
    return {
        "total_unique": total,
        "mastered_count": mastered,
        "mastery_percent": mastery_percent,
    }


async def _session_review_stats(cur, session_id: str) -> Dict[str, float]:
    await cur.execute(
        "SELECT COUNT(*), COALESCE(AVG(rating), 0) FROM mastery_review_events WHERE session_id=%s",
        (session_id,),
    )
    row = await cur.fetchone()
    return {"total_reviews": int(row[0]), "average_rating": float(row[1])}


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
             s.ease_factor, s.interval, s.repetitions, s.lapse_count, s.next_review_at
      FROM flashcards f
      LEFT JOIN card_review_state s ON s.card_id = f.id AND s.user_id = %s
      WHERE f.class_id = %s
        AND (%s::uuid IS NULL OR f.file_id = %s::uuid)
        AND f.deleted_at IS NULL
        AND (s.next_review_at IS NULL OR s.next_review_at <= now())
      ORDER BY s.next_review_at NULLS FIRST, f.created_at ASC
      LIMIT %s
    """
    async with db_conn() as (conn, cur):
        await cur.execute(q, (user_id, class_id, file_id, file_id, limit))
        rows = await cur.fetchall()

    out = []
    for r in rows:
        repetitions = r[9] or 0
        interval = r[8] or 0
        state = "new" if repetitions == 0 else ("learning" if interval == 0 else "review")
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
                "interval_days": interval,
                "repetitions": repetitions,
                "lapses": r[10] or 0,
                "due_at": r[11].isoformat() if r[11] else None,
                "state": state,
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
                normalize_tag_names(payload.tags or []),
                user_id,
            ),
        )
        row = await cur.fetchone()
        card_id = row[0]
        await sync_flashcard_tags(cur, card_id, payload.tags or [])
        await cur.execute(
            """
            INSERT INTO card_review_state (card_id, user_id, next_review_at, repetitions, interval, ease_factor, lapse_count, updated_at)
            VALUES (%s, %s, now(), 0, 0, 2.5, 0, now())
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
        normalized_tags = None
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
            normalized_tags = normalize_tag_names(payload.tags)
            values.append(normalized_tags)
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
        if payload.tags is not None:
            await sync_flashcard_tags(cur, card_id, normalized_tags or [])

        if payload.reset_progress:
            await cur.execute(
                """
                INSERT INTO card_review_state (card_id, user_id, next_review_at, repetitions, interval, ease_factor, lapse_count, updated_at)
                VALUES (%s, %s, now(), 0, 0, 2.5, 0, now())
                ON CONFLICT (card_id, user_id) DO UPDATE
                SET next_review_at=now(),
                    repetitions=0,
                    interval=0,
                    ease_factor=2.5,
                    lapse_count=0,
                    updated_at=now()
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
            SELECT f.class_id, f.file_id
            FROM flashcards f
            WHERE f.id::text=%s AND f.deleted_at IS NULL
            """,
            (card_id,),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Card not found")
        deck_id, topic_id = row
        await _ensure_class_owner(deck_id, user_id)

        updated = await apply_study_review(
            cur,
            user_id=user_id,
            card_id=card_id,
            deck_id=deck_id,
            topic_id=str(topic_id) if topic_id else None,
            rating=rating,
            response_time_ms=payload.response_time_ms,
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
        COUNT(*) FILTER (WHERE s.next_review_at IS NULL OR s.next_review_at <= now()) AS due_now,
        COUNT(*) FILTER (
          WHERE s.next_review_at IS NULL
             OR s.next_review_at <= date_trunc('day', now()) + interval '1 day'
        ) AS due_today,
        COUNT(*) FILTER (WHERE COALESCE(s.repetitions, 0) = 0) AS learning
      FROM flashcards f
      LEFT JOIN card_review_state s ON s.card_id = f.id AND s.user_id = %s
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
                (vec_literal(vec), chunk_id),
            )
        await conn.commit()

 

async def _enqueue_flashcard_job(req: GenerateReq, user_id: str) -> FlashcardJobOut:
    await _ensure_class_owner(req.class_id, user_id)
    if not req.file_ids:
        raise HTTPException(status_code=400, detail="file_ids is required")
    log.info(
        "[flashcards] generation request received user_id=%s class_id=%s requested_files=%d",
        user_id,
        req.class_id,
        len(req.file_ids),
    )

    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT id::text FROM files WHERE class_id=%s AND id = ANY(%s::uuid[])",
            (req.class_id, req.file_ids),
        )
        valid_ids = [r[0] for r in await cur.fetchall()]
        if not valid_ids:
            raise HTTPException(status_code=404, detail="No files found for this class scope.")

        payload = req.model_dump()
        payload["file_ids"] = valid_ids

        correlation_id = str(uuid.uuid4())
        await cur.execute(
            """
            INSERT INTO flashcard_jobs (user_id, deck_id, status, progress, payload, correlation_id)
            VALUES (%s, %s, 'queued', 0, %s::jsonb, %s)
            RETURNING id::text, deck_id, status, progress, correlation_id, error_message, created_at
            """,
            (user_id, req.class_id, json.dumps(payload), correlation_id),
        )
        row = await cur.fetchone()
        await conn.commit()

    log.info(
        "[flashcards] job queued user_id=%s class_id=%s files=%d job_id=%s correlation_id=%s",
        user_id,
        req.class_id,
        len(valid_ids),
        row[0],
        row[4],
    )
    return _job_from_row(row)

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

@router.post("/generate", response_model=FlashcardJobOut)   # <-- no trailing slash
async def generate(req: GenerateReq, user_id: str = Depends(get_request_user_uid)):
    return await _enqueue_flashcard_job(req, user_id)


@router.post("/generate_async", response_model=FlashcardJobOut)
async def generate_async(req: GenerateReq, user_id: str = Depends(get_request_user_uid)):
    return await _enqueue_flashcard_job(req, user_id)


@router.get("/job_status/{job_id}", response_model=FlashcardJobOut)
async def get_flashcard_job_status(job_id: str, user_id: str = Depends(get_request_user_uid)):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT id::text, deck_id, status, progress, correlation_id, error_message, created_at
            FROM flashcard_jobs
            WHERE id::text=%s AND user_id=%s
            """,
            (job_id, user_id),
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_from_row(row)


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
             s.next_review_at, s.repetitions, s.ease_factor, s.interval, s.lapse_count, f.created_at, f.updated_at
      FROM flashcards f
      LEFT JOIN card_review_state s ON s.card_id = f.id AND s.user_id = %s
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
            repetitions = r[10] or 0
            interval = r[12] or 0
            state = "new" if repetitions == 0 else ("learning" if interval == 0 else "review")
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
                    repetitions=repetitions,
                    ease_factor=r[11],
                    interval_days=interval,
                    state=state,
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


@router.post("/mastery/session/start")
async def start_mastery_session(payload: MasteryStartReq, user_id: str = Depends(get_request_user_uid)):
    await _ensure_mastery_schema()
    await _ensure_class_owner(payload.class_id, user_id)
    file_ids = payload.file_ids or []
    if file_ids:
        for fid in file_ids:
            await _ensure_file_in_class(fid, payload.class_id)
    async with db_conn() as (conn, cur):
        if file_ids:
            await cur.execute(
                """
                SELECT id::text, question, answer, hint, difficulty, tags
                FROM flashcards
                WHERE class_id=%s AND deleted_at IS NULL AND file_id = ANY(%s::uuid[])
                ORDER BY created_at ASC
                """,
                (payload.class_id, file_ids),
            )
        else:
            await cur.execute(
                """
                SELECT id::text, question, answer, hint, difficulty, tags
                FROM flashcards
                WHERE class_id=%s AND deleted_at IS NULL
                ORDER BY created_at ASC
                """,
                (payload.class_id,),
            )
        rows = await cur.fetchall()
        if not rows:
            raise HTTPException(status_code=404, detail="No flashcards found")
        card_order = [r[0] for r in rows]
        await cur.execute(
            """
            INSERT INTO mastery_session_queue (user_id, class_id, card_order)
            VALUES (%s, %s, %s::jsonb)
            RETURNING id::text
            """,
            (user_id, payload.class_id, json.dumps(card_order)),
        )
        session_id = (await cur.fetchone())[0]
        stats = await _mastery_stats(cur, user_id, payload.class_id)
        await conn.commit()
    first = rows[0]
    return {
        "session_id": session_id,
        "current_index": 0,
        "total_cards": len(card_order),
        **stats,
        "total_reviews": 0,
        "average_rating": 0,
        "session_seconds": 0,
        "current_card": {
            "id": first[0],
            "question": first[1],
            "answer": first[2],
            "hint": first[3],
            "difficulty": first[4],
            "tags": first[5] or [],
        },
    }


@router.get("/mastery/session/{session_id}")
async def get_mastery_session(session_id: str, user_id: str = Depends(get_request_user_uid)):
    await _ensure_mastery_schema()
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT class_id, card_order, current_index, ended_at, started_at, last_interaction_at
            FROM mastery_session_queue
            WHERE id::text=%s AND user_id=%s
            """,
            (session_id, user_id),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        card_order = row[1] or []
        current_index = row[2] or 0
        ended_at = row[3]
        started_at = row[4]
        last_interaction = row[5] or started_at
        review_stats = await _session_review_stats(cur, session_id)
        session_seconds = (
            int((last_interaction - started_at).total_seconds()) if started_at and last_interaction else 0
        )
        stats = await _mastery_stats(cur, user_id, row[0])
        if ended_at:
            return {
                "session_id": session_id,
                "ended": True,
                "current_card": None,
                "session_seconds": session_seconds,
                **review_stats,
                **stats,
            }
        if not card_order:
            return {
                "session_id": session_id,
                "ended": False,
                "current_card": None,
                "session_seconds": session_seconds,
                **review_stats,
                **stats,
            }
        if current_index >= len(card_order):
            current_index = max(len(card_order) - 1, 0)
        card_id = card_order[current_index]
        await cur.execute(
            """
            SELECT id::text, question, answer, hint, difficulty, tags
            FROM flashcards
            WHERE id::text=%s AND deleted_at IS NULL
            """,
            (card_id,),
        )
        card = await cur.fetchone()
        if not card:
            return {
                "session_id": session_id,
                "ended": False,
                "current_card": None,
                "session_seconds": session_seconds,
                **review_stats,
                **stats,
            }
    return {
        "session_id": session_id,
        "current_index": current_index,
        "total_cards": len(card_order),
        "session_seconds": session_seconds,
        **review_stats,
        **stats,
        "current_card": {
            "id": card[0],
            "question": card[1],
            "answer": card[2],
            "hint": card[3],
            "difficulty": card[4],
            "tags": card[5] or [],
        },
    }


@router.post("/mastery/session/{session_id}/review")
async def review_mastery_card(
    session_id: str,
    payload: MasteryReviewReq,
    user_id: str = Depends(get_request_user_uid),
):
    await _ensure_mastery_schema()
    now = datetime.now(timezone.utc)
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT class_id, card_order, current_index, ended_at, started_at
            FROM mastery_session_queue
            WHERE id::text=%s AND user_id=%s
            """,
            (session_id, user_id),
        )
        session = await cur.fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if session[3]:
            raise HTTPException(status_code=400, detail="Session already ended")
        started_at = session[4]
        card_order = session[1] or []
        current_index = session[2] or 0
        if not card_order:
            raise HTTPException(status_code=400, detail="Session queue is empty")
        if current_index >= len(card_order):
            current_index = len(card_order) - 1
        current_id = card_order[current_index]
        if current_id != payload.card_id:
            raise HTTPException(status_code=400, detail="Card is not the current session item")

        await cur.execute(
            """
            SELECT mastery_level, review_count, consecutive_good, five_count, lapses, mastered
            FROM mastery_card_state
            WHERE card_id=%s AND user_id=%s
            """,
            (payload.card_id, user_id),
        )
        state = await cur.fetchone()
        mastery_level, review_count, consecutive_good, five_count, lapses, mastered = (
            state if state else (0, 0, 0, 0, 0, False)
        )
        review_count += 1
        if payload.rating <= 2:
            lapses += 1
        if payload.rating >= 4:
            consecutive_good += 1
        else:
            consecutive_good = 0
        if payload.rating == 5:
            five_count += 1
        mastered = bool(five_count >= 2 or consecutive_good >= 2)
        mastery_level = _mastery_level_from_rating(payload.rating, mastery_level, mastered)

        await cur.execute(
            """
            INSERT INTO mastery_card_state
              (card_id, user_id, mastery_level, review_count, consecutive_good, five_count, lapses, mastered, last_reviewed, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (card_id, user_id)
            DO UPDATE SET
              mastery_level=EXCLUDED.mastery_level,
              review_count=EXCLUDED.review_count,
              consecutive_good=EXCLUDED.consecutive_good,
              five_count=EXCLUDED.five_count,
              lapses=EXCLUDED.lapses,
              mastered=EXCLUDED.mastered,
              last_reviewed=EXCLUDED.last_reviewed,
              updated_at=now()
            """,
            (
                payload.card_id,
                user_id,
                mastery_level,
                review_count,
                consecutive_good,
                five_count,
                lapses,
                mastered,
                now,
            ),
        )
        await cur.execute(
            """
            INSERT INTO mastery_review_events (user_id, card_id, rating, response_time_ms, session_id)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (user_id, payload.card_id, payload.rating, payload.response_time_ms, session_id),
        )

        card_order.pop(current_index)
        if payload.rating < 5:
            offset = _mastery_offset(payload.rating)
            insert_at = min(current_index + offset, len(card_order))
            card_order.insert(insert_at, current_id)

        if not card_order:
            await cur.execute(
                """
                UPDATE mastery_session_queue
                SET card_order='[]'::jsonb, current_index=0, last_interaction_at=now()
                WHERE id::text=%s AND user_id=%s
                """,
                (session_id, user_id),
            )
            stats = await _mastery_stats(cur, user_id, session[0])
            review_stats = await _session_review_stats(cur, session_id)
            await conn.commit()
            session_seconds = int((now - started_at).total_seconds()) if started_at else 0
            return {
                "session_id": session_id,
                "done": True,
                "current_card": None,
                "session_seconds": session_seconds,
                **review_stats,
                **stats,
            }

        next_index = min(current_index, len(card_order) - 1)
        await cur.execute(
            """
            UPDATE mastery_session_queue
            SET card_order=%s::jsonb, current_index=%s, last_interaction_at=now()
            WHERE id::text=%s AND user_id=%s
            """,
            (json.dumps(card_order), next_index, session_id, user_id),
        )
        await cur.execute(
            """
            SELECT id::text, question, answer, hint, difficulty, tags
            FROM flashcards
            WHERE id::text=%s AND deleted_at IS NULL
            """,
            (card_order[next_index],),
        )
        next_card = await cur.fetchone()
        stats = await _mastery_stats(cur, user_id, session[0])
        review_stats = await _session_review_stats(cur, session_id)
        await conn.commit()
        session_seconds = int((now - started_at).total_seconds()) if started_at else 0

    return {
        "session_id": session_id,
        "done": False,
        "current_index": next_index,
        "total_cards": len(card_order),
        "session_seconds": session_seconds,
        **review_stats,
        **stats,
        "current_card": {
            "id": next_card[0],
            "question": next_card[1],
            "answer": next_card[2],
            "hint": next_card[3],
            "difficulty": next_card[4],
            "tags": next_card[5] or [],
        },
    }


@router.post("/mastery/session/{session_id}/end")
async def end_mastery_session(session_id: str, user_id: str = Depends(get_request_user_uid)):
    await _ensure_mastery_schema()
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE mastery_session_queue
            SET ended_at=now(), last_interaction_at=now()
            WHERE id::text=%s AND user_id=%s
            """,
            (session_id, user_id),
        )
        await conn.commit()
    return {"ok": True, "session_id": session_id}


@router.post("/mastery/reset")
async def reset_mastery_progress(
    class_id: int,
    user_id: str = Depends(get_request_user_uid),
):
    await _ensure_mastery_schema()
    await _ensure_class_owner(class_id, user_id)
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            DELETE FROM mastery_card_state
            WHERE user_id=%s AND card_id IN (
              SELECT id FROM flashcards WHERE class_id=%s AND deleted_at IS NULL
            )
            """,
            (user_id, class_id),
        )
        await cur.execute(
            """
            UPDATE mastery_session_queue
            SET ended_at=now(), last_interaction_at=now()
            WHERE user_id=%s AND class_id=%s AND ended_at IS NULL
            """,
            (user_id, class_id),
        )
        await conn.commit()
    return {"ok": True}


@router.get("/mastery/stats")
async def mastery_stats(
    class_id: int,
    file_id: Optional[str] = None,
    user_id: str = Depends(get_request_user_uid),
):
    await _ensure_mastery_schema()
    await _ensure_class_owner(class_id, user_id)
    async with db_conn() as (conn, cur):
        stats = await _mastery_stats(cur, user_id, class_id, file_id)
        await cur.execute(
            """
            SELECT COUNT(*), COALESCE(AVG(r.rating), 0)
            FROM mastery_review_events r
            JOIN flashcards f ON f.id = r.card_id
            WHERE r.user_id=%s AND f.class_id=%s AND f.deleted_at IS NULL
              AND (%s::uuid IS NULL OR f.file_id=%s::uuid)
            """,
            (user_id, class_id, file_id, file_id),
        )
        row = await cur.fetchone()
    stats["total_reviews"] = int(row[0] or 0)
    stats["average_rating"] = float(row[1] or 0)
    return stats
