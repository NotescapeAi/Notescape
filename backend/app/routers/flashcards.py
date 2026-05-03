from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import uuid
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Path as ApiPath, Query, Depends, UploadFile, File, Request
from pydantic import BaseModel, Field

from app.core.db import db_conn
from app.core.embedding_cache import embed_texts_cached
from app.core.llm import get_embedder, grade_theory_answer
from app.core.settings import settings
from app.dependencies import get_request_user_uid
from app.lib.flashcard_generation import insert_flashcards, pick_relevant_chunks, vec_literal
from app.lib.study_analytics import apply_study_review
from app.lib.tags import normalize_tag_names, sync_flashcard_tags
from app.services.transcription import (
    TranscriptionError,
    TranscriptionUnavailableError,
    get_transcription_service,
)

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
_voice_schema_checked = False

_ALLOWED_AUDIO_TYPES = {
    "audio/webm",
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp4",
    "audio/x-m4a",
    "audio/ogg",
    "video/webm",
}

_AUDIO_EXT_BY_TYPE = {
    "audio/webm": ".webm",
    "video/webm": ".webm",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/ogg": ".ogg",
}


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


async def _ensure_voice_quiz_schema():
    global _voice_schema_checked
    if _voice_schema_checked:
        return
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS voice_quiz_attempts (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id TEXT NOT NULL,
              flashcard_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
              mode TEXT NOT NULL DEFAULT 'voice',
              transcript TEXT,
              audio_url TEXT,
              user_rating INT NOT NULL CHECK (user_rating BETWEEN 1 AND 5),
              score NUMERIC(4, 2),
              feedback TEXT,
              missing_points JSONB,
              session_id TEXT,
              attempt_number INT,
              response_time_seconds NUMERIC(8, 2),
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              next_review_at TIMESTAMPTZ
            )
            """
        )
        await cur.execute("ALTER TABLE voice_quiz_attempts ADD COLUMN IF NOT EXISTS score NUMERIC(4, 2)")
        await cur.execute("ALTER TABLE voice_quiz_attempts ADD COLUMN IF NOT EXISTS feedback TEXT")
        await cur.execute("ALTER TABLE voice_quiz_attempts ADD COLUMN IF NOT EXISTS missing_points JSONB")
        await cur.execute("ALTER TABLE voice_quiz_attempts ADD COLUMN IF NOT EXISTS session_id TEXT")
        await cur.execute("ALTER TABLE voice_quiz_attempts ADD COLUMN IF NOT EXISTS attempt_number INT")
        await cur.execute(
            "CREATE INDEX IF NOT EXISTS voice_quiz_attempts_user_idx ON voice_quiz_attempts (user_id, created_at DESC)"
        )
        await cur.execute(
            "CREATE INDEX IF NOT EXISTS voice_quiz_attempts_card_idx ON voice_quiz_attempts (flashcard_id, created_at DESC)"
        )
        await conn.commit()
    _voice_schema_checked = True


def _voice_rating_to_sm2(rating: int) -> str:
    if rating <= 1:
        return "again"
    if rating == 2:
        return "hard"
    if rating == 3:
        return "good"
    return "easy"


def _is_allowed_audio(content_type: Optional[str], filename: Optional[str]) -> bool:
    ctype = (content_type or "").split(";")[0].strip().lower()
    if ctype in _ALLOWED_AUDIO_TYPES:
        return True
    ext = Path(filename or "").suffix.lower()
    return ext in {".webm", ".wav", ".mp3", ".m4a", ".ogg"}


def _audio_extension(content_type: Optional[str], filename: Optional[str]) -> str:
    ctype = (content_type or "").split(";")[0].strip().lower()
    if ctype in _AUDIO_EXT_BY_TYPE:
        return _AUDIO_EXT_BY_TYPE[ctype]
    ext = Path(filename or "").suffix.lower()
    if ext in {".webm", ".wav", ".mp3", ".m4a", ".ogg"}:
        return ext
    return ".webm"


def _answer_terms(value: str) -> List[str]:
    raw = "".join(ch.lower() if ch.isalnum() else " " for ch in value or "")
    stop = {
        "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
        "you", "your", "has", "have", "had", "but", "not", "into", "its", "their",
        "about", "what", "when", "where", "why", "how", "which", "also", "can",
    }
    return [w for w in raw.split() if len(w) > 2 and w not in stop]


def _evaluate_answer_locally(expected: str, actual: str) -> "VoiceEvaluationOut":
    actual = (actual or "").strip()
    if not actual:
        return VoiceEvaluationOut(
            score=0,
            feedback="No answer was captured.",
            missingPoints=[],
            isCorrectEnough=False,
        )
    expected_terms = _answer_terms(expected)
    actual_terms = set(_answer_terms(actual))
    if not expected_terms:
        return VoiceEvaluationOut(
            score=3,
            feedback="Answer captured. The card answer is too short for detailed scoring.",
            missingPoints=[],
            isCorrectEnough=True,
        )
    key_terms = []
    for term in expected_terms:
        if term not in key_terms:
            key_terms.append(term)
    matched = [term for term in key_terms if term in actual_terms]
    ratio = len(matched) / max(1, len(key_terms))
    if ratio >= 0.82:
        score = 5
        feedback = "Excellent answer. You covered the key points."
    elif ratio >= 0.62:
        score = 4
        feedback = "Good answer. You covered most of the important points."
    elif ratio >= 0.4:
        score = 3
        feedback = "Partially correct. Some core ideas were present, but important details were missing."
    elif ratio >= 0.18:
        score = 2
        feedback = "Weak answer. You mentioned a few related ideas but missed the main explanation."
    else:
        score = 1
        feedback = "Attempt recorded, but it did not match the expected answer closely."
    missing = [term for term in key_terms if term not in actual_terms][:6]
    return VoiceEvaluationOut(
        score=score,
        feedback=feedback,
        missingPoints=missing,
        isCorrectEnough=score >= 4,
    )


def _uploads_root_from_request(request: Request) -> Path:
    root = getattr(request.app.state, "uploads_root", None)
    if root:
        return Path(root)
    configured = getattr(settings, "upload_root", None)
    if configured:
        return Path(configured).resolve()
    return Path.cwd() / "uploads"


def _persist_voice_audio(
    request: Request,
    user_id: str,
    content_type: Optional[str],
    filename: Optional[str],
    data: bytes,
) -> Optional[str]:
    if not settings.voice_quiz_persist_audio:
        return None
    ext = _audio_extension(content_type, filename)
    rel = Path("voice_quiz") / user_id / f"{uuid.uuid4()}{ext}"
    abs_path = _uploads_root_from_request(request) / rel
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    with open(abs_path, "wb") as f:
        f.write(data)
    rel_url = str(rel).replace("\\", "/")
    return f"/uploads/{rel_url}"

class EnsureEmbeddingsReq(BaseModel):
    limit: Optional[int] = Field(default=500)

class GenerateReq(BaseModel):
    class_id: int
    file_ids: List[str] = Field(default_factory=list)
    topic: Optional[str] = None
    style: Optional[str] = Field(default="mixed", pattern="^(mixed|definitions|conceptual|qa)$")
    top_k: int = Field(default=12, ge=1, le=100)
    n_cards: Optional[int] = Field(default=None, ge=1, le=100)
    cardCountMode: Optional[str] = Field(default=None, pattern="^(auto|fixed|custom)$")
    requestedCount: Optional[int] = Field(default=None, ge=1, le=100)
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
    generatedCount: Optional[int] = None
    requestedCount: Optional[int] = None
    cardCountMode: Optional[str] = None
    warning: Optional[str] = None
    sourceDocumentIds: List[str] = Field(default_factory=list)


def _job_from_row(row: Tuple) -> FlashcardJobOut:
    correlation = row[4]
    payload = row[7] if len(row) > 7 and isinstance(row[7], dict) else {}
    return FlashcardJobOut(
        job_id=row[0],
        deck_id=row[1],
        status=row[2],
        progress=row[3],
        correlation_id=str(correlation) if correlation else None,
        error_message=row[5],
        created_at=row[6].isoformat() if row[6] else None,
        generatedCount=payload.get("generatedCount"),
        requestedCount=payload.get("requestedCount"),
        cardCountMode=payload.get("cardCountMode"),
        warning=payload.get("warning"),
        sourceDocumentIds=payload.get("sourceDocumentIds") or payload.get("file_ids") or [],
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
    topic: Optional[str] = "General"
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
    _id, _class_id, _src_id, question, answer, hint, difficulty, topic, tags = row
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
                    topic=(c.get("topic") or topic or (c.get("tags") or ["General"])[0]),
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
    topic: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    difficulty: Optional[str] = Field(default="medium", pattern="^(easy|medium|hard)$")


class ManualUpdateReq(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    file_id: Optional[str] = None
    hint: Optional[str] = None
    topic: Optional[str] = None
    tags: Optional[List[str]] = None
    difficulty: Optional[str] = Field(default=None, pattern="^(easy|medium|hard)$")
    reset_progress: bool = False


class MasteryStartReq(BaseModel):
    class_id: int
    file_ids: Optional[List[str]] = None
    topic: Optional[str] = None


class MasteryReviewReq(BaseModel):
    card_id: str
    rating: int = Field(ge=1, le=5)
    response_time_ms: Optional[int] = Field(default=None, ge=0)


class VoiceTranscriptionOut(BaseModel):
    transcript: str
    audio_url: Optional[str] = None


class VoiceAttemptReq(BaseModel):
    card_id: str
    transcript: str = Field(min_length=1, max_length=20000)
    user_rating: int = Field(ge=1, le=5)
    response_time_seconds: Optional[float] = Field(default=None, ge=0)
    audio_url: Optional[str] = Field(default=None, max_length=2048)
    score: Optional[float] = Field(default=None, ge=0, le=5)
    feedback: Optional[str] = Field(default=None, max_length=4000)
    missing_points: List[str] = Field(default_factory=list)
    session_id: Optional[str] = Field(default=None, max_length=128)
    attempt_number: Optional[int] = Field(default=None, ge=1)


class VoiceEvaluationReq(BaseModel):
    flashcard_id: str
    question: str = Field(min_length=1, max_length=5000)
    expected_answer: str = Field(min_length=1, max_length=10000)
    user_answer_transcript: str = Field(default="", max_length=20000)


class VoiceEvaluationOut(BaseModel):
    score: int
    feedback: str
    missingPoints: List[str] = Field(default_factory=list)
    isCorrectEnough: bool


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
        raw_tags = [payload.topic, *(payload.tags or [])] if payload.topic else (payload.tags or [])
        normalized_tags = normalize_tag_names(raw_tags)
        topic = (payload.topic or (normalized_tags[0] if normalized_tags else "General")).strip()
        await cur.execute(
            """
            INSERT INTO flashcards (class_id, file_id, question, answer, hint, difficulty, tags, topic, created_by, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
            RETURNING id::text
            """,
            (
                payload.class_id,
                payload.file_id,
                payload.question.strip(),
                payload.answer.strip(),
                payload.hint,
                payload.difficulty or "medium",
                normalized_tags,
                topic,
                user_id,
            ),
        )
        row = await cur.fetchone()
        card_id = row[0]
        await sync_flashcard_tags(cur, card_id, normalized_tags)
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
            raw_tags = [payload.topic, *payload.tags] if payload.topic else payload.tags
            normalized_tags = normalize_tag_names(raw_tags)
            values.append(normalized_tags)
        if payload.topic is not None:
            fields.append("topic=%s")
            values.append(payload.topic.strip() or "General")
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


@router.post("/voice/transcribe", response_model=VoiceTranscriptionOut)
async def transcribe_voice_answer(
    request: Request,
    audio: UploadFile = File(...),
    user_id: str = Depends(get_request_user_uid),
):
    await _ensure_voice_quiz_schema()
    max_bytes = max(1, int(settings.voice_quiz_max_audio_mb)) * 1024 * 1024
    filename = os.path.basename(audio.filename or "voice.webm")
    content_type = (audio.content_type or "").split(";")[0].strip().lower()
    if not _is_allowed_audio(content_type, filename):
        raise HTTPException(
            status_code=400,
            detail="Unsupported audio type. Use webm, wav, mp3, m4a, or ogg.",
        )

    raw = await audio.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Audio file is empty.")
    if len(raw) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Audio file is too large. Max size is {int(settings.voice_quiz_max_audio_mb)}MB.",
        )

    transcription = get_transcription_service()
    try:
        transcript = await transcription.transcribe(raw, filename=filename, content_type=content_type or None)
    except TranscriptionUnavailableError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "transcription_unavailable",
                "message": str(exc),
            },
        ) from exc
    except TranscriptionError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "code": "transcription_failed",
                "message": str(exc),
            },
        ) from exc
    except Exception as exc:  # pragma: no cover - defensive fallback
        raise HTTPException(
            status_code=500,
            detail={
                "code": "transcription_internal_error",
                "message": "Unexpected error while transcribing audio.",
            },
        ) from exc

    audio_url = _persist_voice_audio(
        request=request,
        user_id=user_id,
        content_type=content_type or None,
        filename=filename,
        data=raw,
    )
    return VoiceTranscriptionOut(transcript=transcript, audio_url=audio_url)


@router.post("/voice/evaluate", response_model=VoiceEvaluationOut)
async def evaluate_voice_answer(
    payload: VoiceEvaluationReq,
    user_id: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT class_id
            FROM flashcards
            WHERE id::text=%s AND deleted_at IS NULL
            """,
            (payload.flashcard_id,),
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Card not found")
    await _ensure_class_owner(row[0], user_id)
    baseline = _evaluate_answer_locally(payload.expected_answer, payload.user_answer_transcript)
    try:
        grade = await grade_theory_answer(
            payload.question,
            payload.expected_answer,
            payload.user_answer_transcript,
        )
    except Exception:
        return baseline
    score = {0: min(baseline.score, 1), 1: max(2, min(3, baseline.score)), 2: max(4, baseline.score)}.get(grade, baseline.score)
    feedback = baseline.feedback
    if grade == 2:
        feedback = "Good answer. Your response matched the expected meaning."
    elif grade == 1:
        feedback = "Partially correct. You showed some understanding, but important details were missing."
    elif grade == 0:
        feedback = "Attempt recorded, but it did not match the expected answer closely."
    return VoiceEvaluationOut(
        score=score,
        feedback=feedback,
        missingPoints=baseline.missingPoints,
        isCorrectEnough=score >= 4,
    )


@router.post("/voice/attempts")
async def save_voice_attempt(
    payload: VoiceAttemptReq,
    user_id: str = Depends(get_request_user_uid),
):
    await _ensure_voice_quiz_schema()
    transcript = payload.transcript.strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript is required.")
    rating = _voice_rating_to_sm2(payload.user_rating)
    response_ms = (
        int(payload.response_time_seconds * 1000)
        if payload.response_time_seconds is not None
        else None
    )

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT f.class_id, f.file_id
            FROM flashcards f
            WHERE f.id::text=%s AND f.deleted_at IS NULL
            """,
            (payload.card_id,),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Card not found")
        deck_id, topic_id = row
        await _ensure_class_owner(deck_id, user_id)

        updated = await apply_study_review(
            cur,
            user_id=user_id,
            card_id=payload.card_id,
            deck_id=deck_id,
            topic_id=str(topic_id) if topic_id else None,
            rating=rating,
            response_time_ms=response_ms,
        )

        attempt_id = str(uuid.uuid4())
        await cur.execute(
            """
            INSERT INTO voice_quiz_attempts
              (id, user_id, flashcard_id, mode, transcript, audio_url, user_rating,
               score, feedback, missing_points, session_id, attempt_number,
               response_time_seconds, next_review_at)
            VALUES (%s, %s, %s, 'voice', %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s)
            """,
            (
                attempt_id,
                user_id,
                payload.card_id,
                transcript,
                payload.audio_url,
                payload.user_rating,
                payload.score,
                payload.feedback,
                json.dumps(payload.missing_points or []),
                payload.session_id,
                payload.attempt_number,
                payload.response_time_seconds,
                updated.get("next_review_at"),
            ),
        )
        await conn.commit()

    return {
        "ok": True,
        "attempt_id": attempt_id,
        "mode": "voice",
        "state": updated,
    }


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

 

def _estimate_flashcard_count(chunk_count: int, char_count: int, file_count: int) -> Tuple[int, Optional[str]]:
    if char_count < 500:
        count = max(1, min(3, chunk_count))
    elif char_count < 1500:
        count = 5
    elif char_count < 4000:
        count = 8
    elif char_count < 9000:
        count = 12
    elif char_count < 20000:
        count = 20
    elif char_count < 45000:
        count = 30
    else:
        count = 40
    count += max(0, file_count - 1) * 4
    count = max(1, min(50, count))
    warning = None
    if count < 5:
        warning = "The selected content is short, so fewer than 5 useful cards may be generated."
    return count, warning


async def _selected_content_stats(class_id: int, file_ids: List[str]) -> Tuple[int, int]:
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT COUNT(fc.id)::int, COALESCE(SUM(COALESCE(fc.char_len, length(fc.content))), 0)::int
            FROM file_chunks fc
            JOIN files f ON f.id = fc.file_id
            WHERE f.class_id = %s
              AND fc.file_id = ANY(%s::uuid[])
            """,
            (class_id, file_ids),
        )
        row = await cur.fetchone()
    return int(row[0] or 0), int(row[1] or 0)


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

        chunk_count, char_count = await _selected_content_stats(req.class_id, valid_ids)
        mode = req.cardCountMode or ("fixed" if req.n_cards else "auto")
        requested_count = req.requestedCount or req.n_cards
        warning = None
        if mode == "auto":
            target_count, warning = _estimate_flashcard_count(chunk_count, char_count, len(valid_ids))
            requested_count = None
        else:
            target_count = max(1, min(100 if mode == "custom" else 50, int(requested_count or 20)))

        payload = req.model_dump()
        payload["file_ids"] = valid_ids
        payload["sourceDocumentIds"] = valid_ids
        payload["cardCountMode"] = mode
        payload["requestedCount"] = requested_count
        payload["n_cards"] = target_count
        payload["contentStats"] = {"chunks": chunk_count, "chars": char_count}
        if warning:
            payload["warning"] = warning

        correlation_id = str(uuid.uuid4())
        await cur.execute(
            """
            INSERT INTO flashcard_jobs (user_id, deck_id, status, progress, payload, correlation_id)
            VALUES (%s, %s, 'queued', 0, %s::jsonb, %s)
            RETURNING id::text, deck_id, status, progress, correlation_id, error_message, created_at, payload
            """,
            (user_id, req.class_id, json.dumps(payload), correlation_id),
        )
        row = await cur.fetchone()
        await conn.commit()

    log.info(
        "[flashcards] job queued user_id=%s class_id=%s files=%d card_count_mode=%s target=%s chunks=%s chars=%s job_id=%s correlation_id=%s",
        user_id,
        req.class_id,
        len(valid_ids),
        mode,
        target_count,
        chunk_count,
        char_count,
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
            SELECT id::text, deck_id, status, progress, correlation_id, error_message, created_at, payload
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
      SELECT f.id::text, f.class_id, f.file_id::text, f.source_chunk_id, f.question, f.answer, f.hint, f.difficulty, COALESCE(f.topic, f.tags[1], 'General') AS topic, f.tags,
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
        expanded = _maybe_expand_legacy_jsonblob((r[0], r[1], r[3], r[4], r[5], r[6], r[7], r[8], r[9]))
        if expanded:
            out.extend(expanded)
        else:
            repetitions = r[11] or 0
            interval = r[13] or 0
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
                    topic=r[8] or "General",
                    tags=r[9] or [],
                    due_at=r[10].isoformat() if r[10] else None,
                    repetitions=repetitions,
                    ease_factor=r[12],
                    interval_days=interval,
                    state=state,
                    created_at=r[15].isoformat() if r[15] else None,
                    updated_at=r[16].isoformat() if r[16] else None,
                )
            )

    if difficulty:
        out = [c for c in out if (c.difficulty or "medium") == difficulty]
    return out


@router.delete("/{card_id}", status_code=204)
async def delete_flashcard(
    card_id: str = ApiPath(..., description="flashcards.id (UUID)"),
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
    topic = (payload.topic or "").strip() or None
    if file_ids:
        for fid in file_ids:
            await _ensure_file_in_class(fid, payload.class_id)
    async with db_conn() as (conn, cur):
        if file_ids:
            await cur.execute(
                """
                SELECT id::text, question, answer, hint, difficulty, tags
                FROM flashcards
                WHERE class_id=%s
                  AND deleted_at IS NULL
                  AND file_id = ANY(%s::uuid[])
                  AND (%s::text IS NULL OR lower(COALESCE(topic, tags[1], 'General')) = lower(%s::text))
                ORDER BY created_at ASC
                """,
                (payload.class_id, file_ids, topic, topic),
            )
        else:
            await cur.execute(
                """
                SELECT id::text, question, answer, hint, difficulty, tags
                FROM flashcards
                WHERE class_id=%s
                  AND deleted_at IS NULL
                  AND (%s::text IS NULL OR lower(COALESCE(topic, tags[1], 'General')) = lower(%s::text))
                ORDER BY created_at ASC
                """,
                (payload.class_id, topic, topic),
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
            SELECT file_id, COALESCE(topic, tags[1], 'General')
            FROM flashcards
            WHERE id=%s AND class_id=%s AND deleted_at IS NULL
            """,
            (payload.card_id, session[0]),
        )
        card_scope = await cur.fetchone()
        if not card_scope:
            raise HTTPException(status_code=404, detail="Card not found")

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
        rating_label = "again" if payload.rating <= 1 else "hard" if payload.rating == 2 else "good" if payload.rating == 3 else "easy"
        await apply_study_review(
            cur,
            user_id=user_id,
            card_id=payload.card_id,
            deck_id=session[0],
            topic_id=str(card_scope[0]) if card_scope[0] else None,
            rating=rating_label,
            response_time_ms=payload.response_time_ms,
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
