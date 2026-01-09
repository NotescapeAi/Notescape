from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.db import db_conn
from app.dependencies import get_request_user_uid

router = APIRouter()


class ReviewReq(BaseModel):
    card_id: str
    rating: str = Field(pattern="^(again|hard|good|easy)$")


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
    else:
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


@router.get("/api/sr/due/{class_id}")
async def get_due_cards(class_id: int, limit: int = 30, file_id: Optional[str] = None, user_id: str = Depends(get_request_user_uid)):
    q = """
      SELECT f.id::text, f.question, f.answer, s.due_at
      FROM flashcards f
      LEFT JOIN sr_card_state s ON s.card_id = f.id AND s.user_id = %s
      WHERE f.class_id = %s
        AND (%s::uuid IS NULL OR f.file_id = %s::uuid)
        AND (s.due_at IS NULL OR s.due_at <= now())
      ORDER BY s.due_at NULLS FIRST, f.created_at ASC
      LIMIT %s
    """
    async with db_conn() as (conn, cur):
        await cur.execute(q, (user_id, class_id, file_id, file_id, limit))
        rows = await cur.fetchall()
    return [
        {"card_id": r[0], "question": r[1], "answer": r[2], "next_review": r[3].isoformat() if r[3] else None}
        for r in rows
    ]


@router.post("/api/sr/review")
async def post_review(review_data: ReviewReq, user_id: str = Depends(get_request_user_uid)):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT ease_factor, interval_days, repetitions, lapses FROM sr_card_state WHERE card_id=%s AND user_id=%s",
            (review_data.card_id, user_id),
        )
        row = await cur.fetchone()
        if row:
            ease, interval, reps, lapses = row
        else:
            ease, interval, reps, lapses = 2.5, 0, 0, 0

        updated = _sm2_update(float(ease), int(interval), int(reps), int(lapses), review_data.rating)

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
                review_data.card_id,
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
    return {"success": True, "updated_state": updated}
