from typing import List, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app.core.cache import cache_get_json, cache_set_json
from app.core.db import db_conn
from app.dependencies import get_request_user_uid

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

CACHE_TTL_SECONDS = 60
NULL_TOPIC_ID = "00000000-0000-0000-0000-000000000000"


def _cache_key(user_id: str, name: str, suffix: str = "") -> str:
    return f"analytics:{name}:{user_id}:{suffix}".rstrip(":")


def _to_percent(value: float) -> float:
    return round(max(0.0, min(1.0, float(value or 0.0))) * 100.0, 2)


@router.get("/overview")
async def analytics_overview(
    upcoming_days: int = Query(default=7, ge=1, le=60),
    user_id: str = Depends(get_request_user_uid),
):
    cache_key = _cache_key(user_id, "overview", f"upcoming={upcoming_days}")
    cached = cache_get_json(cache_key)
    if cached is not None:
        return cached

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT
              COALESCE(SUM(total_reviews) FILTER (WHERE day = current_date), 0) AS reviews_today,
              COALESCE(SUM(total_reviews) FILTER (WHERE day >= current_date - interval '6 days'), 0) AS reviews_last_7_days,
              COALESCE(SUM(total_response_time_ms) FILTER (WHERE day >= current_date - interval '6 days'), 0) AS rt_sum,
              COALESCE(SUM(total_reviews) FILTER (WHERE day >= current_date - interval '6 days'), 0) AS rt_count
            FROM study_event_rollups_daily
            WHERE user_id=%s
            """,
            (user_id,),
        )
        row = await cur.fetchone()
        await cur.execute(
            """
            SELECT COUNT(*)
            FROM card_review_state
            WHERE user_id=%s
              AND next_review_at <= now() + (%s || ' days')::interval
            """,
            (user_id, upcoming_days),
        )
        upcoming = await cur.fetchone()

    rt_sum = float(row[2] or 0)
    rt_count = float(row[3] or 0)
    avg_response_time = (rt_sum / rt_count) if rt_count else 0.0

    payload = {
        "reviews_today": int(row[0] or 0),
        "reviews_last_7_days": int(row[1] or 0),
        "avg_response_time": avg_response_time,
        "upcoming_reviews_count": int(upcoming[0] or 0),
    }
    cache_set_json(cache_key, payload, ttl_seconds=CACHE_TTL_SECONDS)
    return payload


@router.get("/study-trends")
async def study_trends(
    days: int = Query(default=30, ge=7, le=180),
    user_id: str = Depends(get_request_user_uid),
):
    cache_key = _cache_key(user_id, "study-trends", f"days={days}")
    cached = cache_get_json(cache_key)
    if cached is not None:
        return cached

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT day,
                   SUM(total_reviews) AS total_reviews,
                   CASE WHEN SUM(total_reviews) > 0
                        THEN SUM(total_response_time_ms)::float / SUM(total_reviews)
                        ELSE 0 END AS avg_response_time
            FROM study_event_rollups_daily
            WHERE user_id=%s
              AND day >= current_date - (%s || ' days')::interval
            GROUP BY day
            ORDER BY day
            """,
            (user_id, days),
        )
        rows = await cur.fetchall()

    series = [
        {
            "day": r[0].isoformat(),
            "total_reviews": int(r[1] or 0),
            "avg_response_time": float(r[2] or 0),
        }
        for r in rows
    ]
    cache_set_json(cache_key, series, ttl_seconds=CACHE_TTL_SECONDS)
    return series


@router.get("/weak-topics")
async def weak_topics(
    days: int = Query(default=30, ge=7, le=180),
    limit: int = Query(default=15, ge=1, le=50),
    user_id: str = Depends(get_request_user_uid),
):
    cache_key = _cache_key(user_id, "weak-topics", f"days={days}:limit={limit}")
    cached = cache_get_json(cache_key)
    if cached is not None:
        return cached

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            WITH recent AS (
              SELECT
                deck_id,
                topic_id,
                SUM(total_reviews) AS total_reviews,
                SUM(again_count + hard_count) AS struggle_reviews,
                SUM(total_response_time_ms) AS total_response_time_ms
              FROM study_event_rollups_daily
              WHERE user_id=%s
                AND day >= current_date - (%s || ' days')::interval
              GROUP BY deck_id, topic_id
            ),
            state AS (
              SELECT
                f.class_id AS deck_id,
                f.file_id AS topic_id,
                AVG(s.lapse_count) AS avg_lapses,
                AVG(s.interval) AS avg_interval
              FROM card_review_state s
              JOIN flashcards f ON f.id = s.card_id
              WHERE s.user_id=%s AND f.deleted_at IS NULL
              GROUP BY f.class_id, f.file_id
            )
            SELECT
              r.deck_id,
              r.topic_id,
              r.total_reviews,
              r.struggle_reviews,
              CASE WHEN r.total_reviews > 0
                   THEN r.struggle_reviews::float / r.total_reviews
                   ELSE 0 END AS struggle_rate,
              CASE WHEN r.total_reviews > 0
                   THEN r.total_response_time_ms::float / r.total_reviews
                   ELSE 0 END AS avg_response_time,
              COALESCE(s.avg_lapses, 0) AS avg_lapses,
              COALESCE(s.avg_interval, 0) AS avg_interval,
              (
                (CASE WHEN r.total_reviews > 0 THEN r.struggle_reviews::float / r.total_reviews ELSE 0 END) * 0.5
                + LEAST(1, (CASE WHEN r.total_reviews > 0 THEN r.total_response_time_ms::float / r.total_reviews ELSE 0 END) / 8000) * 0.2
                + LEAST(1, COALESCE(s.avg_lapses, 0) / 5) * 0.2
                + LEAST(1, (1 - LEAST(COALESCE(s.avg_interval, 0), 30) / 30)) * 0.1
              ) AS weakness_score
            FROM recent r
            LEFT JOIN state s
              ON s.deck_id = r.deck_id AND s.topic_id = r.topic_id
            ORDER BY weakness_score DESC
            LIMIT %s
            """,
            (user_id, days, user_id, limit),
        )
        rows = await cur.fetchall()

    results: List[Dict[str, object]] = []
    for r in rows:
        results.append(
            {
                "deck_id": r[0],
                "topic_id": None if (not r[1] or str(r[1]) == NULL_TOPIC_ID) else str(r[1]),
                "total_reviews": int(r[2] or 0),
                "struggle_reviews": int(r[3] or 0),
                "struggle_rate": float(r[4] or 0),
                "avg_response_time": float(r[5] or 0),
                "avg_lapses": float(r[6] or 0),
                "avg_interval": float(r[7] or 0),
                "weakness_score": float(r[8] or 0),
            }
        )

    cache_set_json(cache_key, results, ttl_seconds=CACHE_TTL_SECONDS)
    return results


@router.get("/weak-cards")
async def weak_cards(
    days: int = Query(default=30, ge=7, le=180),
    limit: int = Query(default=15, ge=1, le=50),
    deck_id: Optional[int] = Query(default=None),
    user_id: str = Depends(get_request_user_uid),
):
    cache_key = _cache_key(user_id, "weak-cards", f"days={days}:limit={limit}:deck={deck_id or 'all'}")
    cached = cache_get_json(cache_key)
    if cached is not None:
        return cached

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            WITH recent AS (
              SELECT
                card_id,
                deck_id,
                topic_id,
                SUM(total_reviews) AS total_reviews,
                SUM(again_count + hard_count) AS struggle_reviews,
                SUM(total_response_time_ms) AS total_response_time_ms
              FROM study_event_rollups_card_daily
              WHERE user_id=%s
                AND day >= current_date - (%s || ' days')::interval
                AND (%s::int IS NULL OR deck_id=%s::int)
              GROUP BY card_id, deck_id, topic_id
            )
            SELECT
              r.card_id::text,
              f.question,
              r.deck_id,
              r.topic_id,
              r.total_reviews,
              r.struggle_reviews,
              CASE WHEN r.total_reviews > 0
                   THEN r.struggle_reviews::float / r.total_reviews
                   ELSE 0 END AS struggle_rate,
              CASE WHEN r.total_reviews > 0
                   THEN r.total_response_time_ms::float / r.total_reviews
                   ELSE 0 END AS avg_response_time,
              COALESCE(s.lapse_count, 0) AS lapse_count,
              COALESCE(s.interval, 0) AS interval,
              (
                (CASE WHEN r.total_reviews > 0 THEN r.struggle_reviews::float / r.total_reviews ELSE 0 END) * 0.55
                + LEAST(1, (CASE WHEN r.total_reviews > 0 THEN r.total_response_time_ms::float / r.total_reviews ELSE 0 END) / 8000) * 0.2
                + LEAST(1, COALESCE(s.lapse_count, 0) / 5) * 0.15
                + LEAST(1, (1 - LEAST(COALESCE(s.interval, 0), 30) / 30)) * 0.1
              ) AS weakness_score
            FROM recent r
            JOIN flashcards f ON f.id = r.card_id AND f.deleted_at IS NULL
            LEFT JOIN card_review_state s ON s.card_id = r.card_id AND s.user_id=%s
            ORDER BY weakness_score DESC
            LIMIT %s
            """,
            (user_id, days, deck_id, deck_id, user_id, limit),
        )
        rows = await cur.fetchall()

    results: List[Dict[str, object]] = []
    for r in rows:
        results.append(
            {
                "card_id": r[0],
                "question": r[1],
                "deck_id": r[2],
                "topic_id": None if (not r[3] or str(r[3]) == NULL_TOPIC_ID) else str(r[3]),
                "total_reviews": int(r[4] or 0),
                "struggle_reviews": int(r[5] or 0),
                "struggle_rate": float(r[6] or 0),
                "avg_response_time": float(r[7] or 0),
                "lapse_count": int(r[8] or 0),
                "interval": int(r[9] or 0),
                "weakness_score": float(r[10] or 0),
            }
        )

    cache_set_json(cache_key, results, ttl_seconds=CACHE_TTL_SECONDS)
    return results


@router.get("/weak-tags")
async def weak_tags(
    limit: int = Query(default=5, ge=1, le=25),
    recent_quiz_attempts: int = Query(default=50, ge=10, le=300),
    recent_flashcard_reviews: int = Query(default=50, ge=10, le=300),
    user_id: str = Depends(get_request_user_uid),
):
    cache_key = _cache_key(
        user_id,
        "weak-tags",
        f"limit={limit}:quiz={recent_quiz_attempts}:flash={recent_flashcard_reviews}",
    )
    cached = cache_get_json(cache_key)
    if cached is not None:
        return cached

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            WITH quiz_recent AS (
              SELECT
                qqa.question_id,
                GREATEST(0::float, LEAST(1::float, COALESCE(qqa.score, 0))) AS score,
                qqa.graded_at,
                q.class_id
              FROM quiz_question_attempts qqa
              JOIN quiz_attempts qa ON qa.id = qqa.attempt_id
              JOIN quizzes q ON q.id = qa.quiz_id
              WHERE qa.user_id = %s
              ORDER BY qqa.graded_at DESC
              LIMIT %s
            ),
            quiz_by_tag AS (
              SELECT
                qqt.tag_id,
                AVG(qr.score) AS quiz_accuracy,
                MAX(qr.graded_at) AS quiz_last_seen,
                MIN(qr.class_id) AS class_id
              FROM quiz_recent qr
              JOIN quiz_question_tags qqt ON qqt.question_id = qr.question_id
              GROUP BY qqt.tag_id
            ),
            flash_recent AS (
              SELECT
                fr.flashcard_id,
                lower(fr.rating) AS rating,
                fr.reviewed_at,
                f.class_id
              FROM flashcard_reviews fr
              JOIN flashcards f ON f.id = fr.flashcard_id
              WHERE fr.user_id = %s
                AND f.deleted_at IS NULL
              ORDER BY fr.reviewed_at DESC
              LIMIT %s
            ),
            flash_by_tag AS (
              SELECT
                ft.tag_id,
                AVG(
                  CASE WHEN fr.rating IN ('again','hard','0','1','2') THEN 1.0 ELSE 0.0 END
                ) AS flashcard_difficulty,
                MAX(fr.reviewed_at) AS flash_last_seen,
                MIN(fr.class_id) AS class_id
              FROM flash_recent fr
              JOIN flashcard_tags ft ON ft.flashcard_id = fr.flashcard_id
              GROUP BY ft.tag_id
            )
            SELECT
              t.id,
              t.name,
              COALESCE(q.quiz_accuracy, 0) AS quiz_accuracy,
              COALESCE(f.flashcard_difficulty, 0) AS flashcard_difficulty,
              GREATEST(
                COALESCE(q.quiz_last_seen, to_timestamp(0)),
                COALESCE(f.flash_last_seen, to_timestamp(0))
              ) AS last_seen,
              (
                (1 - COALESCE(q.quiz_accuracy, 0)) * 0.6
                + COALESCE(f.flashcard_difficulty, 0) * 0.4
              ) AS weakness_score,
              COALESCE(f.class_id, q.class_id) AS class_id
            FROM tags t
            LEFT JOIN quiz_by_tag q ON q.tag_id = t.id
            LEFT JOIN flash_by_tag f ON f.tag_id = t.id
            WHERE q.tag_id IS NOT NULL OR f.tag_id IS NOT NULL
            ORDER BY weakness_score DESC, last_seen DESC
            LIMIT %s
            """,
            (user_id, recent_quiz_attempts, user_id, recent_flashcard_reviews, limit),
        )
        rows = await cur.fetchall()

    payload = [
        {
            "tag_id": int(r[0]),
            "tag": r[1],
            "quiz_accuracy": float(r[2] or 0),
            "quiz_accuracy_pct": _to_percent(float(r[2] or 0)),
            "flashcard_difficulty": float(r[3] or 0),
            "flashcard_difficulty_pct": _to_percent(float(r[3] or 0)),
            "last_seen": r[4].isoformat() if r[4] else None,
            "weakness_score": float(r[5] or 0),
            "class_id": int(r[6]) if r[6] is not None else None,
        }
        for r in rows
    ]
    cache_set_json(cache_key, payload, ttl_seconds=CACHE_TTL_SECONDS)
    return payload


@router.get("/tag/{tag_id}")
async def tag_analytics(
    tag_id: int = Path(..., ge=1),
    recent_quiz_attempts: int = Query(default=50, ge=10, le=300),
    recent_flashcard_reviews: int = Query(default=50, ge=10, le=300),
    user_id: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        await cur.execute("SELECT id, name FROM tags WHERE id=%s", (tag_id,))
        tag_row = await cur.fetchone()
        if not tag_row:
            raise HTTPException(status_code=404, detail="Tag not found")

        await cur.execute(
            """
            WITH quiz_recent AS (
              SELECT qqa.question_id, GREATEST(0::float, LEAST(1::float, COALESCE(qqa.score, 0))) AS score
              FROM quiz_question_attempts qqa
              JOIN quiz_attempts qa ON qa.id = qqa.attempt_id
              WHERE qa.user_id = %s
              ORDER BY qqa.graded_at DESC
              LIMIT %s
            ),
            flash_recent AS (
              SELECT fr.flashcard_id, lower(fr.rating) AS rating
              FROM flashcard_reviews fr
              WHERE fr.user_id = %s
              ORDER BY fr.reviewed_at DESC
              LIMIT %s
            )
            SELECT
              COALESCE((SELECT AVG(qr.score)
                        FROM quiz_recent qr
                        JOIN quiz_question_tags qqt ON qqt.question_id = qr.question_id
                        WHERE qqt.tag_id=%s), 0) AS quiz_accuracy,
              COALESCE((SELECT AVG(CASE WHEN fr.rating IN ('again','hard','0','1','2') THEN 1.0 ELSE 0.0 END)
                        FROM flash_recent fr
                        JOIN flashcard_tags ft ON ft.flashcard_id = fr.flashcard_id
                        WHERE ft.tag_id=%s), 0) AS flashcard_difficulty,
              COALESCE((SELECT COUNT(*)
                        FROM quiz_question_tags qqt
                        JOIN quiz_questions qq ON qq.id = qqt.question_id
                        JOIN quizzes q ON q.id = qq.quiz_id
                        WHERE qqt.tag_id=%s AND q.created_by=%s), 0) AS quiz_question_count,
              COALESCE((SELECT COUNT(*)
                        FROM flashcard_tags ft
                        JOIN flashcards f ON f.id = ft.flashcard_id
                        WHERE ft.tag_id=%s AND f.created_by=%s AND f.deleted_at IS NULL), 0) AS flashcard_count
            """,
            (
                user_id,
                recent_quiz_attempts,
                user_id,
                recent_flashcard_reviews,
                tag_id,
                tag_id,
                tag_id,
                user_id,
                tag_id,
                user_id,
            ),
        )
        row = await cur.fetchone()

    quiz_accuracy = float(row[0] or 0)
    flash_difficulty = float(row[1] or 0)
    payload = {
        "tag_id": int(tag_row[0]),
        "tag": tag_row[1],
        "quiz_accuracy": quiz_accuracy,
        "quiz_accuracy_pct": _to_percent(quiz_accuracy),
        "flashcard_difficulty": flash_difficulty,
        "flashcard_difficulty_pct": _to_percent(flash_difficulty),
        "quiz_question_count": int(row[2] or 0),
        "flashcard_count": int(row[3] or 0),
        "weakness_score": (1 - quiz_accuracy) * 0.6 + flash_difficulty * 0.4,
    }
    return payload


@router.get("/quiz-breakdown/{attempt_id}")
async def quiz_breakdown(
    attempt_id: str = Path(...),
    user_id: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT 1 FROM quiz_attempts WHERE id::text=%s AND user_id=%s",
            (attempt_id, user_id),
        )
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Attempt not found")

        await cur.execute(
            """
            SELECT
              t.id,
              t.name,
              AVG(GREATEST(0::float, LEAST(1::float, COALESCE(qqa.score, 0)))) AS accuracy,
              COUNT(*) AS total_questions,
              SUM(CASE WHEN COALESCE(qqa.score, 0) < 0.7 THEN 1 ELSE 0 END) AS struggled_questions
            FROM quiz_question_attempts qqa
            JOIN quiz_question_tags qqt ON qqt.question_id = qqa.question_id
            JOIN tags t ON t.id = qqt.tag_id
            WHERE qqa.attempt_id::text=%s
            GROUP BY t.id, t.name
            ORDER BY accuracy ASC, total_questions DESC
            """,
            (attempt_id,),
        )
        rows = await cur.fetchall()

        await cur.execute(
            """
            SELECT
              qqt.tag_id,
              mp.value
            FROM quiz_question_attempts qqa
            JOIN quiz_question_tags qqt ON qqt.question_id = qqa.question_id
            LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(qqa.missing_points, '[]'::jsonb)) mp(value) ON TRUE
            WHERE qqa.attempt_id::text=%s
              AND mp.value IS NOT NULL
            """,
            (attempt_id,),
        )
        missing_rows = await cur.fetchall()

    missing_by_tag: Dict[int, List[str]] = {}
    for tag_id, item in missing_rows:
        missing_by_tag.setdefault(int(tag_id), [])
        if item not in missing_by_tag[int(tag_id)]:
            missing_by_tag[int(tag_id)].append(item)

    by_tag = []
    struggled = []
    for row in rows:
        accuracy = float(row[2] or 0)
        item = {
            "tag_id": int(row[0]),
            "tag": row[1],
            "accuracy": accuracy,
            "accuracy_pct": _to_percent(accuracy),
            "total_questions": int(row[3] or 0),
            "struggled_questions": int(row[4] or 0),
            "missing_points": missing_by_tag.get(int(row[0]), []),
        }
        by_tag.append(item)
        if accuracy < 0.7:
            struggled.append(row[1])

    return {
        "attempt_id": attempt_id,
        "struggled_tags": struggled[:5],
        "by_tag": by_tag,
    }
