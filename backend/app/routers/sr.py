from fastapi import APIRouter
from pydantic import BaseModel
from app.core.db import db_conn
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo  # Python 3.9+ required for timezone handling
import logging

router = APIRouter()

# Define Pakistani timezone
PKT = ZoneInfo("Asia/Karachi")

# Flashcard model to receive data
class Flashcard(BaseModel):
    card_id: str
    difficulty: int  # 1–5 user rating
    retrievability: float  # 0–1, probability of recall
    stability: float  # Stability in minutes or days
    difficulty_factor: float  # Difficulty coefficient
    question: str
    answer: str

# FSRS Algorithm: Calculating next review time based on difficulty, stability, and retrievability
def calculate_fsrs(card: Flashcard):
    R = card.retrievability
    S = card.stability
    D = card.difficulty_factor

    # More difficult → lower stability
    if card.difficulty <= 2:
        S = 1  # review very soon
    elif card.difficulty == 3:
        S = max(5, S * 1.1)  # small improvement
    elif card.difficulty >= 4:
        S = max(60, S * 1.5)  # increase stability for easier cards (rating 5 -> 60 minutes)

    # Adjust retrievability (bounded 0–1)
    R = min(1.0, max(0.0, R + (card.difficulty - 3) * 0.1))

    # Get current time in Pakistani timezone
    now_local = datetime.now(PKT)
    next_local = now_local + timedelta(minutes=S)  # Add stability to current time

    # Convert next review time to UTC for storage
    next_utc = next_local.astimezone(timezone.utc)

    # Return updated state with next review time in UTC
    return {"retrievability": R, "stability": S, "next_review": next_utc}

# --- GET due cards --- (Updated for FSRS with PKT handling)
@router.get("/api/sr/due/{class_id}")
async def get_due_cards(class_id: int, limit: int = 30):
    async with db_conn() as (conn, cur):
        query = """
        SELECT 
            f.id AS card_id, 
            COALESCE(s.difficulty, 3) AS difficulty,
            COALESCE(s.retrievability, 0.5) AS retrievability,
            COALESCE(s.stability, 5) AS stability,
            COALESCE(s.difficulty_factor, 1.0) AS difficulty_factor,
            f.question, f.answer, s.next_review
        FROM flashcards f
        LEFT JOIN sr_card_state s ON s.card_id = f.id AND s.user_id = %s
        WHERE f.class_id = %s
          AND (s.next_review IS NULL OR s.next_review <= NOW())
        ORDER BY s.next_review NULLS FIRST, f.created_at ASC
        LIMIT %s;
        """
        await cur.execute(query, ('dev-user', class_id, limit))
        rows = await cur.fetchall()

    return [
        {
            "card_id": r[0],
            "difficulty": r[1],
            "retrievability": r[2],
            "stability": r[3],
            "difficulty_factor": r[4],
            "question": r[5],
            "answer": r[6],
            "next_review": r[7].isoformat() if r[7] else None,  # Return ISO with time zone info
        }
        for r in rows
    ]

# --- POST review --- (Updated for FSRS with PKT handling)
@router.post("/api/sr/review")
async def post_review(review_data: Flashcard):
    logging.info(f"Received review data: {review_data}")  # Log the incoming review data
    updated_state = calculate_fsrs(review_data)

    async with db_conn() as (conn, cur):
        query = """
        INSERT INTO sr_card_state (card_id, user_id, retrievability, stability, difficulty, next_review, reps)
        VALUES (%s, %s, %s, %s, %s, %s, 1)
        ON CONFLICT (card_id, user_id) DO UPDATE
        SET retrievability = EXCLUDED.retrievability,
            stability = EXCLUDED.stability,
            difficulty = EXCLUDED.difficulty,
            next_review = EXCLUDED.next_review,
            reps = sr_card_state.reps + 1;
        """
        try:
            await cur.execute(
                query,
                (
                    review_data.card_id,
                    'dev-user',  # Assuming 'dev-user' for now, replace with actual user
                    updated_state['retrievability'],
                    updated_state['stability'],
                    review_data.difficulty,
                    updated_state['next_review'].isoformat(),  # Storing in UTC format
                )
            )
            return {"success": True, "updated_state": updated_state}
        except Exception as e:
            logging.error(f"Error: {str(e)}")  # Log error details
            return {"error": str(e)}  # Return the error message for debugging

