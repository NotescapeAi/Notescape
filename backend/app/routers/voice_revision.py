from typing import Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Path

from app.core.db import db_conn
from app.dependencies import get_request_user_uid

router = APIRouter(prefix="/api/voice-revision", tags=["voice-revision"])


async def _ensure_session_owner(cur, session_id: str, user_id: str):
    await cur.execute(
        """
        SELECT id, user_id, class_id, topic, mode, duration_minutes, status, metadata
        FROM voice_revision_sessions
        WHERE id::text=%s
        """,
        (session_id,),
    )
    row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    if row[1] != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return {
        "id": row[0],
        "user_id": row[1],
        "class_id": row[2],
        "topic": row[3],
        "mode": row[4],
        "duration_minutes": row[5],
        "status": row[6],
        "metadata": row[7] or {},
    }


async def _ensure_class_owner(cur, class_id: int, user_id: str):
    if user_id == "dev-user":
        await cur.execute("SELECT 1 FROM classes WHERE id=%s", (class_id,))
    else:
        await cur.execute("SELECT 1 FROM classes WHERE id=%s AND owner_uid=%s", (class_id, user_id))
    if not await cur.fetchone():
        raise HTTPException(status_code=404, detail="Class not found")


def _score_answer(expected: str, transcript: str) -> Dict[str, Any]:
    expected_terms = _tokenize(expected)
    actual_terms = _tokenize(transcript)
    if not transcript.strip():
        return {
            "score": 0,
            "verdict": "incorrect",
            "feedback": "No answer was captured.",
            "missing_points": expected_terms[:5],
            "correct_answer": expected.strip(),
        }
    if not expected_terms:
        return {
            "score": 65,
            "verdict": "partially_correct",
            "feedback": "Answer captured. This item has a short answer key.",
            "missing_points": [],
            "correct_answer": expected.strip(),
        }

    matched = [t for t in expected_terms if t in actual_terms]
    ratio = len(matched) / max(1, len(expected_terms))
    score = round(_clamp01(ratio) * 100)
    verdict = "correct" if score >= 80 else "partially_correct" if score >= 50 else "incorrect"
    missing = [t for t in expected_terms if t not in actual_terms][:5]
    feedback = (
        "Great job, you covered the key points."
        if verdict == "correct"
        else "Decent start, but a few core points were missed."
        if verdict == "partially_correct"
        else "This needs review. Let's try a simpler explanation."
    )
    return {
        "score": score,
        "verdict": verdict,
        "feedback": feedback,
        "missing_points": missing,
        "correct_answer": expected.strip(),
    }


def _tokenize(value: str):
    raw = "".join(ch.lower() if ch.isalnum() else " " for ch in value or "")
    return [w for w in raw.split() if len(w) > 2]


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, float(v or 0.0)))


async def _pick_question(cur, class_id: int, topic: Optional[str]) -> Optional[Dict[str, Any]]:
    await cur.execute(
        """
        SELECT id, question, answer, COALESCE(topic, tags[1], 'General') AS topic
        FROM flashcards
        WHERE class_id=%s AND deleted_at IS NULL
        ORDER BY (COALESCE(topic, tags[1], 'General') = %s) DESC, random()
        LIMIT 1
        """,
        (class_id, topic or "General"),
    )
    row = await cur.fetchone()
    if not row:
        return None
    return {
        "flashcard_id": str(row[0]),
        "question": row[1],
        "expected_answer": row[2],
        "topic": row[3] or topic or "General",
    }


@router.post("/sessions")
async def start_voice_session(payload: Dict[str, Any], user_id: str = Depends(get_request_user_uid)):
    class_id = int(payload.get("class_id") or 0)
    if class_id <= 0:
        raise HTTPException(status_code=400, detail="class_id is required")

    topic = payload.get("topic")
    mode = payload.get("mode") or "mixed"
    duration = int(payload.get("duration_minutes") or 10)
    plan_item_id = payload.get("plan_item_id")

    async with db_conn() as (conn, cur):
        await _ensure_class_owner(cur, class_id, user_id)
        await cur.execute(
            """
            INSERT INTO voice_revision_sessions (user_id, class_id, topic, mode, duration_minutes, metadata)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb)
            RETURNING id, started_at
            """,
            (user_id, class_id, topic, mode, duration, {"plan_item_id": plan_item_id} if plan_item_id else {}),
        )
        row = await cur.fetchone()
        session_id, started_at = row[0], row[1]
        await conn.commit()

    return {
        "id": str(session_id),
        "started_at": started_at.isoformat() if started_at else None,
        "status": "active",
    }


@router.post("/sessions/{session_id}/next-question")
async def next_voice_question(
    session_id: str = Path(...),
    user_id: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        session = await _ensure_session_owner(cur, session_id, user_id)
        if session["status"] != "active":
            raise HTTPException(status_code=400, detail="Session is not active")
        question = await _pick_question(cur, session["class_id"], session.get("topic"))
        if not question:
            raise HTTPException(status_code=400, detail="No study content found for this class.")
    return question


@router.post("/sessions/{session_id}/evaluate")
async def evaluate_voice_answer(
    session_id: str = Path(...),
    payload: Dict[str, Any] = None,
    user_id: str = Depends(get_request_user_uid),
):
    transcript = (payload or {}).get("transcript") or ""
    expected_answer = (payload or {}).get("expected_answer") or ""
    question_text = (payload or {}).get("question") or ""
    topic = (payload or {}).get("topic")

    if not expected_answer:
        raise HTTPException(status_code=400, detail="expected_answer is required")

    async with db_conn() as (conn, cur):
        session = await _ensure_session_owner(cur, session_id, user_id)
        evaluation = _score_answer(expected_answer, transcript)
        await cur.execute(
            """
            INSERT INTO voice_revision_turns
              (session_id, topic, question, student_transcript, expected_answer, evaluation, score, is_correct, feedback)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s)
            RETURNING id, created_at
            """,
            (
                session["id"],
                topic or session.get("topic"),
                question_text,
                transcript,
                expected_answer,
                evaluation,
                evaluation["score"],
                evaluation["verdict"] == "correct",
                evaluation["feedback"],
            ),
        )
        turn_row = await cur.fetchone()

        # update overall score
        await cur.execute(
            """
            UPDATE voice_revision_sessions
            SET overall_score = sub.avg_score
            FROM (
              SELECT AVG(score) AS avg_score
              FROM voice_revision_turns
              WHERE session_id=%s
            ) sub
            WHERE id=%s
            """,
            (session["id"], session["id"]),
        )
        await conn.commit()

    return {
        "turn_id": str(turn_row[0]),
        "created_at": turn_row[1].isoformat() if turn_row[1] else None,
        "evaluation": evaluation,
    }


@router.patch("/sessions/{session_id}/end")
async def end_voice_session(
    session_id: str = Path(...),
    user_id: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        session = await _ensure_session_owner(cur, session_id, user_id)
        await cur.execute(
            """
            UPDATE voice_revision_sessions
            SET status='completed', ended_at=now()
            WHERE id=%s
            """,
            (session["id"],),
        )

        plan_item_id = session.get("metadata", {}).get("plan_item_id")
        if plan_item_id:
            await cur.execute(
                "UPDATE study_plan_items SET status='completed', updated_at=now() WHERE id::text=%s",
                (plan_item_id,),
            )
        await conn.commit()
    return {"ok": True, "session_id": session_id}


@router.get("/sessions/{session_id}")
async def voice_session_summary(
    session_id: str = Path(...),
    user_id: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        session = await _ensure_session_owner(cur, session_id, user_id)
        await cur.execute(
            """
            SELECT id, topic, question, student_transcript, expected_answer, evaluation, score, feedback, created_at
            FROM voice_revision_turns
            WHERE session_id=%s
            ORDER BY created_at
            """,
            (session["id"],),
        )
        turns = await cur.fetchall()
    return {
        **session,
        "turns": [
            {
                "id": str(t[0]),
                "topic": t[1],
                "question": t[2],
                "student_transcript": t[3],
                "expected_answer": t[4],
                "evaluation": t[5],
                "score": float(t[6] or 0),
                "feedback": t[7],
                "created_at": t[8].isoformat() if t[8] else None,
            }
            for t in turns
        ],
    }
