from typing import List, Dict, Optional

from fastapi import APIRouter, Depends, Query

from app.core.cache import cache_get_json, cache_set_json
from app.core.db import db_conn
from app.dependencies import get_request_user_uid

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

CACHE_TTL_SECONDS = 60
NULL_TOPIC_ID = "00000000-0000-0000-0000-000000000000"


def _cache_key(user_id: str, name: str, suffix: str = "") -> str:
    return f"analytics:{name}:{user_id}:{suffix}".rstrip(":")


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
