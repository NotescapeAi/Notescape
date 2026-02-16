from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.db import db_conn
from app.dependencies import get_request_user_uid
from app.lib.study_analytics import apply_study_review

router = APIRouter()


class ReviewReq(BaseModel):
    card_id: str
    rating: str = Field(pattern="^(again|hard|good|easy)$")
    response_time_ms: Optional[int] = Field(default=None, ge=0)


@router.get("/api/sr/due/{class_id}")
async def get_due_cards(class_id: int, limit: int = 30, file_id: Optional[str] = None, user_id: str = Depends(get_request_user_uid)):
    q = """
      SELECT f.id::text, f.question, f.answer, s.next_review_at, s.repetitions, s.interval
      FROM flashcards f
      LEFT JOIN card_review_state s ON s.card_id = f.id AND s.user_id = %s
      WHERE f.class_id = %s
        AND (%s::uuid IS NULL OR f.file_id = %s::uuid)
        AND (s.next_review_at IS NULL OR s.next_review_at <= now())
      ORDER BY s.next_review_at NULLS FIRST, f.created_at ASC
      LIMIT %s
    """
    async with db_conn() as (conn, cur):
        await cur.execute(q, (user_id, class_id, file_id, file_id, limit))
        rows = await cur.fetchall()
    out = []
    for r in rows:
        repetitions = r[4] or 0
        interval = r[5] or 0
        state = "new" if repetitions == 0 else ("learning" if interval == 0 else "review")
        out.append(
            {
                "card_id": r[0],
                "question": r[1],
                "answer": r[2],
                "next_review": r[3].isoformat() if r[3] else None,
                "state": state,
            }
        )
    return out


@router.post("/api/sr/review")
async def post_review(review_data: ReviewReq, user_id: str = Depends(get_request_user_uid)):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT class_id, file_id
            FROM flashcards
            WHERE id::text=%s AND deleted_at IS NULL
            """,
            (review_data.card_id,),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Card not found")
        deck_id, topic_id = row

        updated = await apply_study_review(
            cur,
            user_id=user_id,
            card_id=review_data.card_id,
            deck_id=deck_id,
            topic_id=str(topic_id) if topic_id else None,
            rating=review_data.rating,
            response_time_ms=review_data.response_time_ms,
        )
        await conn.commit()
    return {"success": True, "updated_state": updated}
