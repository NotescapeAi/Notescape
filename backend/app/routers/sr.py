
        # app/routers/sr.py

from typing import Optional, List
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel, Field
from datetime import datetime, timezone, timedelta
import os

from app.core.db import db_conn
from app.core.scheduler import BrainLikeScheduler, SRState

router = APIRouter(prefix="/api/sr", tags=["spaced-repetition"])
sched = BrainLikeScheduler()

# Demo-friendly fast intervals (minutes)
FAST_INTERVALS = {
    1: timedelta(minutes=1),
    2: timedelta(minutes=3),
    3: timedelta(minutes=10),
    4: timedelta(minutes=30),
    5: timedelta(minutes=60),
}

# ---------- MODELS ----------

class Flashcard(BaseModel):
    # FIX: include class_id so our query construction doesn't fail
    class_id: int
    id: str
    question: str
    answer: str
    hint: Optional[str] = None
    difficulty: Optional[str] = "medium"
    # Keep as ISO string for the frontend (nullable)
    due_at: Optional[str] = None


class ReviewReq(BaseModel):
    card_id: str
    rating: int = Field(ge=1, le=5)


def _get_user_id(x_user_id: Optional[str]) -> str:
    # Dev-safe fallback when header missing
    return (x_user_id or "dev-user").strip()


# ---------- ROUTES ----------

@router.get("/due/{class_id}", response_model=List[Flashcard])
async def due_cards(
    class_id: int,
    limit: int = Query(default=30, ge=1, le=10000),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    user_id = _get_user_id(x_user_id)
    now = datetime.now(timezone.utc)

    q = """
    WITH base AS (
      SELECT f.id::text AS id, f.class_id, f.question, f.answer, f.hint, f.difficulty, s.due_at
      FROM flashcards f
      LEFT JOIN sr_card_state s ON s.card_id = f.id AND s.user_id = %s
      WHERE f.class_id = %s
    )
    SELECT id, class_id, question, answer, hint, difficulty, due_at
    FROM base
    WHERE (due_at IS NULL) OR (due_at <= %s)
    ORDER BY due_at NULLS FIRST
    LIMIT %s;
    """
    async with db_conn() as (conn, cur):
        await cur.execute(q, (user_id, class_id, now, limit))
        rows = await cur.fetchall()

    out: List[Flashcard] = []
    for r in rows:
        due_at = r[6]
        # FIX: serialize datetime → ISO string for the frontend
        due_at_iso = due_at.isoformat() if isinstance(due_at, datetime) else None
        out.append(
            Flashcard(
                class_id=r[1],
                id=r[0],
                question=r[2],
                answer=r[3],
                hint=r[4],
                difficulty=r[5] or "medium",
                due_at=due_at_iso,
            )
        )
    return out


@router.post("/review")
async def review_card(
    body: ReviewReq,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
):
    user_id = _get_user_id(x_user_id)
    now = datetime.now(timezone.utc)

    fetch_q = """
      SELECT f.class_id, s.repetition, s.ease_factor, s.interval_minutes, s.learning, s.due_at, s.last_review
      FROM flashcards f
      LEFT JOIN sr_card_state s ON s.card_id = f.id AND s.user_id = %s
      WHERE f.id = %s::uuid
    """
    async with db_conn() as (conn, cur):
        await cur.execute(fetch_q, (user_id, body.card_id))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Card not found")

        class_id, repetition, ef, interval_minutes, learning, due_at, last_review = row
        state = SRState(
            repetition=repetition or 0,
            ease_factor=float(ef or 2.5),
            interval_minutes=float(interval_minutes or 0.0),
            learning=bool(learning) if learning is not None else True,
            due_at=due_at or now,
            last_review=last_review,
        )

        new_state = sched.review(state, rating=body.rating, now=now)

        # FIX: override due_at using fast demo intervals (1–60 mins)
        if body.rating in FAST_INTERVALS:
            new_state.due_at = now + FAST_INTERVALS[body.rating]

        upsert_q = """
        INSERT INTO sr_card_state (user_id, card_id, repetition, ease_factor, interval_minutes, learning, due_at, last_review)
        VALUES (%s, %s::uuid, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (user_id, card_id)
        DO UPDATE SET
          repetition = EXCLUDED.repetition,
          ease_factor = EXCLUDED.ease_factor,
          interval_minutes = EXCLUDED.interval_minutes,
          learning = EXCLUDED.learning,
          due_at = EXCLUDED.due_at,
          last_review = EXCLUDED.last_review
        """
        await cur.execute(
            upsert_q,
            (
                user_id,
                body.card_id,
                new_state.repetition,
                new_state.ease_factor,
                new_state.interval_minutes,
                new_state.learning,
                new_state.due_at,
                now,
            ),
        )

        await cur.execute(
            "INSERT INTO sr_reviews (user_id, card_id, rating, reviewed_at) VALUES (%s, %s::uuid, %s, %s)",
            (user_id, body.card_id, body.rating, now),
        )

        await conn.commit()

    return {
        "ok": True,
        "next_due_at": new_state.due_at.isoformat() if new_state.due_at else None,
        "state": {
            "repetition": new_state.repetition,
            "ease_factor": round(new_state.ease_factor, 3),
            "interval_minutes": new_state.interval_minutes,
            "learning": new_state.learning,
        },
    }
