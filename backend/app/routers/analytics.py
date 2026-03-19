from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Tuple
from datetime import date, timedelta, datetime
import asyncio
import json
from pathlib import Path
import re
import logging
from app.core.db import db_conn, is_db_available
from app.dependencies import get_request_user_uid
from app.core.cache import cache_get_json, cache_set_json
import math

router = APIRouter(prefix="/api/analytics", tags=["analytics"])
CACHE_TTL_SECONDS = 300
log = logging.getLogger("uvicorn.error")

def _cache_key(user_id: str, key: str) -> str:
    return f"analytics:{user_id}:{key}"

class AnalyticsOverview(BaseModel):
    reviews_today: int
    reviews_last_7_days: int
    avg_response_time: float
    avg_session_duration: float
    upcoming_reviews_count: int
    total_study_time: int
    study_time_today: int
    study_activity_time: int
    study_duration_time: int
    engagement_score: int

class StreaksResponse(BaseModel):
    current_streak: int
    longest_streak: int
    total_active_days: int
    last_activity_date: Optional[str]

class MyInspoImage(BaseModel):
    url: str
    filename: str

class StudyTrendPoint(BaseModel):
    day: str
    total_reviews: int
    avg_response_time: float
    study_time: int
    duration_seconds: Optional[int] = 0

class WeakTopic(BaseModel):
    deck_id: int
    topic_id: Optional[str]
    total_reviews: int
    struggle_reviews: int
    struggle_rate: float
    avg_response_time: float
    avg_lapses: float
    avg_interval: float
    weakness_score: float

class WeakCard(BaseModel):
    card_id: str
    question: str
    deck_id: int
    topic_id: Optional[str]
    total_reviews: int
    struggle_reviews: int
    struggle_rate: float
    avg_response_time: float
    lapse_count: int
    interval: int
    weakness_score: float

class WeakTag(BaseModel):
    tag_id: int
    tag: str
    quiz_accuracy: float
    quiz_accuracy_pct: float
    flashcard_difficulty: float
    flashcard_difficulty_pct: float
    weakness_score: float
    class_id: Optional[int] = None
    last_seen: Optional[str] = None
    flashcard_count: Optional[int] = 0

class QuizBreakdown(BaseModel):
    attempt_id: str
    struggled_tags: List[str]
    by_tag: List[Dict[str, Any]]

class ClassProgress(BaseModel):
    class_id: int
    class_name: str
    total_cards: int
    reviewed_cards: int
    study_time_seconds: int
    reviewed_percentage: float

class ActivityTimelineItem(BaseModel):
    id: str
    kind: str
    occurred_at: str
    title: str
    detail: Optional[str] = None
    class_id: Optional[int] = None
    class_name: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)

@router.get("/activity-timeline", response_model=List[ActivityTimelineItem])
async def activity_timeline(
    limit: int = Query(25, ge=1, le=50),
    trace: bool = False,
    user_id: str = Depends(get_request_user_uid),
) -> List[ActivityTimelineItem]:
    if not is_db_available():
        return []

    events: List[Tuple[datetime, Dict[str, Any]]] = []
    source_counts: Dict[str, int] = {
        "study_sessions": 0,
        "files": 0,
        "study_events": 0,
        "quiz_attempts": 0,
        "classes": 0,
    }

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT
              s.id::text,
              s.class_id,
              s.mode,
              s.started_at,
              s.ended_at,
              s.duration_seconds,
              s.active_seconds,
              c.name AS class_name
            FROM study_sessions s
            LEFT JOIN classes c ON c.id = s.class_id AND c.owner_uid = s.user_id
            WHERE s.user_id=%s
            ORDER BY s.started_at DESC
            LIMIT %s
            """,
            (user_id, limit),
        )
        session_rows = await cur.fetchall()
        source_counts["study_sessions"] = len(session_rows)
        for r in session_rows:
            occurred_at = r[4] or r[3]
            if not occurred_at:
                continue
            events.append(
                (
                    occurred_at,
                    {
                        "id": r[0],
                        "kind": "study_session",
                        "occurred_at": occurred_at.isoformat(),
                        "title": f"{r[2] or 'Study'} session",
                        "detail": r[7] or (f"Class #{r[1]}" if r[1] is not None else None),
                        "class_id": r[1],
                        "class_name": r[7],
                        "meta": {
                            "mode": r[2],
                            "duration_seconds": r[5],
                            "active_seconds": r[6],
                            "started_at": r[3].isoformat() if r[3] else None,
                            "ended_at": r[4].isoformat() if r[4] else None,
                        },
                    },
                )
            )

        await cur.execute(
            """
            SELECT
              f.id::text,
              f.class_id,
              f.filename,
              f.uploaded_at,
              f.size_bytes,
              c.name AS class_name
            FROM files f
            JOIN classes c ON c.id = f.class_id
            WHERE c.owner_uid=%s
            ORDER BY f.uploaded_at DESC
            LIMIT %s
            """,
            (user_id, limit),
        )
        file_rows = await cur.fetchall()
        source_counts["files"] = len(file_rows)
        for r in file_rows:
            occurred_at = r[3]
            if not occurred_at:
                continue
            events.append(
                (
                    occurred_at,
                    {
                        "id": r[0],
                        "kind": "document_upload",
                        "occurred_at": occurred_at.isoformat(),
                        "title": "Uploaded document",
                        "detail": r[2],
                        "class_id": r[1],
                        "class_name": r[5],
                        "meta": {"filename": r[2], "size_bytes": r[4]},
                    },
                )
            )

        await cur.execute(
            """
            SELECT
              e.id::text,
              e.deck_id,
              e.rating,
              e.response_time_ms,
              e.created_at,
              c.name AS class_name
            FROM study_events e
            LEFT JOIN classes c ON c.id = e.deck_id AND c.owner_uid = e.user_id
            WHERE e.user_id=%s
            ORDER BY e.created_at DESC
            LIMIT %s
            """,
            (user_id, limit),
        )
        study_event_rows = await cur.fetchall()
        source_counts["study_events"] = len(study_event_rows)
        for r in study_event_rows:
            occurred_at = r[4]
            if not occurred_at:
                continue
            events.append(
                (
                    occurred_at,
                    {
                        "id": r[0],
                        "kind": "flashcard_review",
                        "occurred_at": occurred_at.isoformat(),
                        "title": "Reviewed flashcard",
                        "detail": r[5] or (f"Class #{r[1]}" if r[1] is not None else None),
                        "class_id": r[1],
                        "class_name": r[5],
                        "meta": {
                            "rating": r[2],
                            "response_time_ms": r[3],
                        },
                    },
                )
            )

        await cur.execute(
            """
            SELECT
              qa.id::text,
              q.id::text AS quiz_id,
              q.class_id,
              q.title,
              qa.status,
              qa.score,
              qa.total,
              qa.started_at,
              qa.submitted_at,
              qa.created_at,
              c.name AS class_name
            FROM quiz_attempts qa
            JOIN quizzes q ON q.id = qa.quiz_id
            JOIN classes c ON c.id = q.class_id
            WHERE qa.user_id=%s AND c.owner_uid=%s
            ORDER BY COALESCE(qa.submitted_at, qa.started_at, qa.created_at) DESC
            LIMIT %s
            """,
            (user_id, user_id, limit),
        )
        quiz_rows = await cur.fetchall()
        source_counts["quiz_attempts"] = len(quiz_rows)
        for r in quiz_rows:
            occurred_at = r[8] or r[7] or r[9]
            if not occurred_at:
                continue
            status = r[4]
            title = "Submitted quiz" if status == "submitted" else "Started quiz"
            detail = r[3] or "Quiz"
            events.append(
                (
                    occurred_at,
                    {
                        "id": r[0],
                        "kind": "quiz_attempt",
                        "occurred_at": occurred_at.isoformat(),
                        "title": title,
                        "detail": detail,
                        "class_id": r[2],
                        "class_name": r[10],
                        "meta": {
                            "quiz_id": r[1],
                            "status": status,
                            "score": r[5],
                            "total": r[6],
                            "started_at": r[7].isoformat() if r[7] else None,
                            "submitted_at": r[8].isoformat() if r[8] else None,
                        },
                    },
                )
            )

        await cur.execute(
            """
            SELECT id, name, created_at
            FROM classes
            WHERE owner_uid=%s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (user_id, limit),
        )
        class_rows = await cur.fetchall()
        source_counts["classes"] = len(class_rows)
        for r in class_rows:
            occurred_at = r[2]
            if not occurred_at:
                continue
            events.append(
                (
                    occurred_at,
                    {
                        "id": str(r[0]),
                        "kind": "class_created",
                        "occurred_at": occurred_at.isoformat(),
                        "title": "Created class",
                        "detail": r[1],
                        "class_id": r[0],
                        "class_name": r[1],
                        "meta": {},
                    },
                )
            )

    events.sort(key=lambda x: x[0], reverse=True)
    out = [e[1] for e in events[:limit]]

    if trace:
        counts: Dict[str, int] = {}
        for e in out:
            counts[e["kind"]] = counts.get(e["kind"], 0) + 1
        newest = out[0]["occurred_at"] if out else None
        log.info(
            "activity_timeline trace user=%s limit=%s total=%s counts=%s sources=%s newest=%s",
            user_id,
            limit,
            len(out),
            counts,
            source_counts,
            newest,
        )

    return out

@router.get("/classes")
async def classes_progress(user_id: str = Depends(get_request_user_uid)) -> List[ClassProgress]:
    if not is_db_available():
        return [
             ClassProgress(class_id=1, class_name="Biology 101", total_cards=50, reviewed_cards=25, study_time_seconds=3600, reviewed_percentage=50.0),
             ClassProgress(class_id=2, class_name="History of Art", total_cards=30, reviewed_cards=5, study_time_seconds=1200, reviewed_percentage=16.7),
             ClassProgress(class_id=3, class_name="Computer Science", total_cards=100, reviewed_cards=80, study_time_seconds=7200, reviewed_percentage=80.0),
        ]
    
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT
                c.id,
                c.name,
                COUNT(DISTINCT f.id) as total_cards,
                COUNT(DISTINCT s.card_id) as reviewed_cards,
                COALESCE(ss_agg.total_seconds, 0) as study_time
            FROM classes c
            LEFT JOIN flashcards f ON c.id = f.class_id AND f.deleted_at IS NULL
            LEFT JOIN card_review_state s ON f.id = s.card_id AND s.user_id = %s
            LEFT JOIN (
                SELECT class_id, SUM(active_seconds) as total_seconds
                FROM study_sessions
                WHERE user_id = %s
                GROUP BY class_id
            ) ss_agg ON c.id = ss_agg.class_id
            WHERE c.owner_uid = %s
            GROUP BY c.id, c.name, ss_agg.total_seconds
            ORDER BY ss_agg.total_seconds DESC NULLS LAST
            """,
            (user_id, user_id, user_id)
        )
        rows = await cur.fetchall()
        
    results = []
    for r in rows:
        class_id, name, total, reviewed, study_time = r
        pct = (reviewed / total * 100) if total > 0 else 0.0
        results.append(ClassProgress(
            class_id=class_id,
            class_name=name,
            total_cards=total,
            reviewed_cards=reviewed,
            study_time_seconds=int(study_time),
            reviewed_percentage=pct
        ))
    return results

@router.get("/streaks")
async def analytics_streaks(user_id: str = Depends(get_request_user_uid)) -> StreaksResponse:
    if not is_db_available():
        # Mock data for degraded mode
        return StreaksResponse(
            current_streak=5,
            longest_streak=12,
            total_active_days=45,
            last_activity_date=date.today().isoformat()
        )

    cache_key = _cache_key(user_id, "streaks")
    cached = cache_get_json(cache_key)
    if cached is not None:
        return cached

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT DISTINCT day FROM (
                SELECT day FROM study_event_rollups_daily WHERE user_id=%s AND total_reviews > 0
                UNION ALL
                SELECT started_at::DATE as day FROM study_sessions WHERE user_id=%s
                UNION ALL
                SELECT f.uploaded_at::DATE as day 
                FROM files f 
                JOIN classes c ON c.id = f.class_id 
                WHERE c.owner_uid=%s
                UNION ALL
                SELECT qa.started_at::DATE as day 
                FROM quiz_attempts qa 
                WHERE qa.user_id=%s
                UNION ALL
                SELECT created_at::DATE as day FROM classes WHERE owner_uid=%s
            ) as combined_activity
            WHERE day IS NOT NULL
            ORDER BY day DESC
            """,
            (user_id, user_id, user_id, user_id, user_id),
        )
        rows = await cur.fetchall()

    active_days = [r[0] for r in rows]
    
    if not active_days:
        payload = {
            "current_streak": 0,
            "longest_streak": 0,
            "total_active_days": 0,
            "last_activity_date": None,
        }
        cache_set_json(cache_key, payload, ttl_seconds=CACHE_TTL_SECONDS)
        return payload

    today = date.today()
    yesterday = today - timedelta(days=1)
    
    current_streak = 0
    if active_days[0] == today or active_days[0] == yesterday:
        current_streak = 1
        for i in range(1, len(active_days)):
            if active_days[i] == active_days[i-1] - timedelta(days=1):
                current_streak += 1
            else:
                break
    
    longest_streak = 0
    if active_days:
        temp_streak = 1
        longest_streak = 1
        for i in range(1, len(active_days)):
            if active_days[i] == active_days[i-1] - timedelta(days=1):
                temp_streak += 1
            else:
                longest_streak = max(longest_streak, temp_streak)
                temp_streak = 1
        longest_streak = max(longest_streak, temp_streak)

    payload = {
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "total_active_days": len(active_days),
        "last_activity_date": active_days[0].isoformat() if active_days else None,
    }
    cache_set_json(cache_key, payload, ttl_seconds=CACHE_TTL_SECONDS)
    return payload

@router.get("/myinspo", response_model=List[MyInspoImage])
async def list_myinspo_images(request: Request, user_id: str = Depends(get_request_user_uid)) -> List[MyInspoImage]:
    safe_user = re.sub(r"[^a-zA-Z0-9_-]", "_", user_id or "")
    uploads_root = getattr(request.app.state, "uploads_root", None)
    base_root = Path(str(uploads_root)) if uploads_root is not None else None
    if base_root is None:
        raise HTTPException(status_code=500, detail="Uploads root not configured")

    folder = (base_root / "myinspo" / safe_user).resolve()
    if not folder.exists() or not folder.is_dir():
        return []

    allowed = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    out: List[MyInspoImage] = []
    for p in sorted(folder.iterdir(), key=lambda x: x.name.lower()):
        if not p.is_file():
            continue
        if p.suffix.lower() not in allowed:
            continue
        url = str(request.base_url).rstrip("/") + f"/uploads/myinspo/{safe_user}/{p.name}"
        out.append(MyInspoImage(url=url, filename=p.name))
    return out

@router.get("/overview")
async def analytics_overview(
    today_start: Optional[datetime] = None,
    user_id: str = Depends(get_request_user_uid)
) -> AnalyticsOverview:
    if not is_db_available():
        # Mock data for degraded mode
        return AnalyticsOverview(
            reviews_today=25,
            reviews_last_7_days=150,
            avg_response_time=3500.5,
            avg_session_duration=1200.0,
            upcoming_reviews_count=10,
            total_study_time=7200, # 2 hours
            study_time_today=1800, # 30 mins
            study_activity_time=5400, # 1.5 hours
            study_duration_time=9000,
            engagement_score=85
        )

    async with db_conn() as (conn, cur):
        # reviews_today
        # Note: rollups are daily based on server time, so this might still be slightly off for timezones
        # but study_sessions below will be accurate if today_start is provided
        await cur.execute(
            "SELECT COALESCE(SUM(total_reviews), 0) FROM study_event_rollups_daily WHERE user_id=%s AND day=CURRENT_DATE",
            (user_id,)
        )
        reviews_today = (await cur.fetchone())[0]

        # reviews_last_7_days
        await cur.execute(
            "SELECT COALESCE(SUM(total_reviews), 0) FROM study_event_rollups_daily WHERE user_id=%s AND day >= CURRENT_DATE - INTERVAL '7 days'",
            (user_id,)
        )
        reviews_last_7_days = (await cur.fetchone())[0]

        # avg_response_time
        await cur.execute(
            """
            SELECT CASE WHEN SUM(total_reviews) > 0 THEN SUM(total_response_time_ms) / SUM(total_reviews) ELSE 0 END
            FROM study_event_rollups_daily WHERE user_id=%s
            """,
            (user_id,)
        )
        avg_resp = float((await cur.fetchone())[0] or 0)

        # upcoming_reviews_count
        await cur.execute(
            "SELECT COUNT(*) FROM card_review_state WHERE user_id=%s AND next_review_at <= NOW()",
            (user_id,)
        )
        upcoming = (await cur.fetchone())[0]

        # total_study_time & session count for avg duration
        await cur.execute(
            "SELECT COALESCE(SUM(active_seconds), 0), COUNT(*), COALESCE(SUM(duration_seconds), 0) FROM study_sessions WHERE user_id=%s",
            (user_id,)
        )
        row = await cur.fetchone()
        total_study_time = row[0]
        total_sessions = row[1]
        total_duration = row[2]
        
        avg_session_duration = 0.0
        if total_sessions > 0:
            avg_session_duration = float(total_study_time) / total_sessions

        # study_time_today
        st_params = [user_id]
        if today_start:
             st_clause = "started_at >= %s"
             st_params.append(today_start)
        else:
             st_clause = "started_at >= CURRENT_DATE"

        await cur.execute(
            f"SELECT COALESCE(SUM(active_seconds), 0) FROM study_sessions WHERE user_id=%s AND {st_clause}",
            tuple(st_params)
        )
        study_time_today = (await cur.fetchone())[0]

    study_activity_time = total_study_time
    study_duration_time = total_duration
    engagement_score = min(100, int(reviews_last_7_days * 0.5 + (total_study_time / 3600) * 5))

    return AnalyticsOverview(
        reviews_today=reviews_today,
        reviews_last_7_days=reviews_last_7_days,
        avg_response_time=avg_resp,
        avg_session_duration=avg_session_duration,
        upcoming_reviews_count=upcoming,
        total_study_time=total_study_time,
        study_time_today=study_time_today,
        study_activity_time=study_activity_time,
        study_duration_time=study_duration_time,
        engagement_score=engagement_score
    )

@router.get("/trends")
async def study_trends(days: int = 30, user_id: str = Depends(get_request_user_uid)) -> List[StudyTrendPoint]:
    if not is_db_available():
        # Mock data for degraded mode
        points = []
        current = date.today() - timedelta(days=days)
        today = date.today()
        import random
        while current <= today:
            points.append(StudyTrendPoint(
                day=current.isoformat(), 
                total_reviews=random.randint(10, 50), 
                avg_response_time=random.uniform(2000, 5000), 
                study_time=random.randint(900, 3600)
            ))
            current += timedelta(days=1)
        return points

    async with db_conn() as (conn, cur):
        start_date = date.today() - timedelta(days=days)
        
        # Get reviews
        await cur.execute(
            """
            SELECT day, SUM(total_reviews), SUM(total_response_time_ms)
            FROM study_event_rollups_daily
            WHERE user_id=%s AND day >= %s
            GROUP BY day
            ORDER BY day
            """,
            (user_id, start_date)
        )
        review_rows = await cur.fetchall()
        reviews_map = {r[0]: (r[1], r[2]) for r in review_rows}
        
        # Get study time (active_seconds) and duration
        await cur.execute(
            """
            SELECT DATE(started_at) as day, SUM(active_seconds), SUM(duration_seconds)
            FROM study_sessions
            WHERE user_id=%s AND started_at >= %s
            GROUP BY day
            ORDER BY day
            """,
            (user_id, start_date)
        )
        session_rows = await cur.fetchall()
        sessions_map = {r[0]: (r[1], r[2]) for r in session_rows}
        
    points = []
    current = start_date
    today = date.today()
    while current <= today:
        rev_data = reviews_map.get(current, (0, 0))
        total_reviews = rev_data[0]
        total_resp_ms = rev_data[1]
        avg_resp = (total_resp_ms / total_reviews) if total_reviews > 0 else 0
        
        sess_data = sessions_map.get(current, (0, 0))
        study_time = sess_data[0] or 0
        duration_time = sess_data[1] or 0
        
        points.append(StudyTrendPoint(
            day=current.isoformat(),
            total_reviews=total_reviews,
            avg_response_time=avg_resp,
            study_time=study_time,
            duration_seconds=duration_time
        ))
        current += timedelta(days=1)
        
    return points

@router.get("/weak-topics")
async def weak_topics(user_id: str = Depends(get_request_user_uid)) -> List[WeakTopic]:
    if not is_db_available():
        # Mock data for degraded mode
        return [
            WeakTopic(deck_id=1, topic_id="Algebra", total_reviews=100, struggle_reviews=30, struggle_rate=0.3, avg_response_time=4500, avg_lapses=2, avg_interval=3, weakness_score=80),
            WeakTopic(deck_id=1, topic_id="Geometry", total_reviews=80, struggle_reviews=15, struggle_rate=0.18, avg_response_time=3200, avg_lapses=1, avg_interval=5, weakness_score=45),
            WeakTopic(deck_id=2, topic_id="Physics", total_reviews=50, struggle_reviews=25, struggle_rate=0.5, avg_response_time=6000, avg_lapses=3, avg_interval=2, weakness_score=95),
        ]

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT deck_id, topic_id, 
            SUM(total_reviews) as total,
            SUM(again_count + hard_count) as struggles,
            CASE WHEN SUM(total_reviews) > 0 THEN SUM(total_response_time_ms) / SUM(total_reviews) ELSE 0 END as avg_time
            FROM study_event_rollups_daily
            WHERE user_id=%s
            GROUP BY deck_id, topic_id
            HAVING SUM(total_reviews) > 0
            ORDER BY (SUM(again_count + hard_count)::float / SUM(total_reviews)) DESC, SUM(total_reviews) DESC
            LIMIT 10
            """,
            (user_id,)
        )
        rows = await cur.fetchall()
        
    results = []
    for r in rows:
        deck_id, topic_id, total, struggles, avg_time = r
        struggle_rate = struggles / total if total > 0 else 0
        weakness_score = struggle_rate * math.log(total + 1) * 10
        results.append(WeakTopic(
            deck_id=deck_id,
            topic_id=str(topic_id) if topic_id else None,
            total_reviews=total,
            struggle_reviews=struggles,
            struggle_rate=struggle_rate,
            avg_response_time=avg_time,
            avg_lapses=0, # Simplified for now
            avg_interval=0,
            weakness_score=weakness_score
        ))
    return results

@router.get("/stream")
async def analytics_stream(user_id: str = Depends(get_request_user_uid)):
    """
    Server-Sent Events (SSE) endpoint for real-time analytics updates.
    Pushes updates every 5 seconds.
    """
    async def event_generator():
        while True:
            try:
                if is_db_available():
                    async with db_conn() as (conn, cur):
                        # Fetch reviews today for real-time counter
                        await cur.execute(
                            "SELECT COALESCE(SUM(total_reviews), 0) FROM study_event_rollups_daily WHERE user_id=%s AND day=CURRENT_DATE",
                            (user_id,)
                        )
                        row = await cur.fetchone()
                        reviews_today = row[0] if row else 0
                        
                        # Fetch total study time and duration
                        await cur.execute(
                            "SELECT COALESCE(SUM(active_seconds), 0), COUNT(*), COALESCE(SUM(duration_seconds), 0) FROM study_sessions WHERE user_id=%s",
                            (user_id,)
                        )
                        row = await cur.fetchone()
                        total_study_time = row[0] if row else 0
                        total_sessions = row[1] if row else 0
                        total_duration = row[2] if row else 0
                        
                        avg_session_duration = 0.0
                        if total_sessions > 0:
                            avg_session_duration = float(total_study_time) / total_sessions
                        
                        # Fetch current streak (simplified check for real-time)
                        # We just need to know if today is active to potentially increment displayed streak
                        # But for full calculation, we might need more. 
                        # For now, let's just send what we can easily calculate or rely on the initial fetch for base streak
                        # and only update if today's activity changed status.
                        
                        payload = {
                            "reviews_today": reviews_today,
                            "total_study_time": total_study_time,
                            "study_duration_time": total_duration,
                            "avg_session_duration": avg_session_duration,
                            "timestamp": datetime.now().isoformat()
                        }
                        
                        data = {
                            "type": "overview_update",
                            "payload": payload
                        }
                        yield f"data: {json.dumps(data)}\n\n"
                else:
                    # Mock data update in degraded mode
                    import random
                    payload = {
                        "reviews_today": random.randint(20, 30),
                        "total_study_time": 7200 + random.randint(0, 100),
                        "timestamp": datetime.now().isoformat()
                    }
                    data = {
                        "type": "overview_update",
                        "payload": payload
                    }
                    yield f"data: {json.dumps(data)}\n\n"
            except Exception as e:
                print(f"Stream error: {e}")
                # Don't crash the stream, just skip this beat or send error
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                
            await asyncio.sleep(5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.get("/weak-cards")
async def weak_cards(user_id: str = Depends(get_request_user_uid)) -> List[WeakCard]:
    if not is_db_available():
        # Mock data for degraded mode
        return [
            WeakCard(card_id="c1", question="What is the quadratic formula?", deck_id=1, topic_id="Algebra", total_reviews=10, struggle_reviews=5, struggle_rate=0.5, avg_response_time=8000, lapse_count=3, interval=1, weakness_score=90),
            WeakCard(card_id="c2", question="Define Newton's Second Law", deck_id=2, topic_id="Physics", total_reviews=8, struggle_reviews=3, struggle_rate=0.375, avg_response_time=5000, lapse_count=1, interval=3, weakness_score=60),
            WeakCard(card_id="c3", question="Capital of France?", deck_id=3, topic_id="Geography", total_reviews=20, struggle_reviews=2, struggle_rate=0.1, avg_response_time=1500, lapse_count=0, interval=10, weakness_score=15),
        ]

    # Real implementation
    try:
        async with db_conn() as (conn, cur):
            # We need to join with flashcards table to get the question
            await cur.execute(
                """
                SELECT 
                    f.id,
                    f.question,
                    f.deck_id,
                    f.topic_id,
                    SUM(ser.total_reviews) as total_reviews,
                    SUM(ser.again_count + ser.hard_count) as struggles,
                    COALESCE(crs.lapse_count, 0) as lapse_count,
                    COALESCE(crs.interval, 0) as interval,
                    CASE WHEN SUM(ser.total_reviews) > 0 THEN SUM(ser.total_response_time_ms) / SUM(ser.total_reviews) ELSE 0 END as avg_time
                FROM study_event_rollups_card_daily ser
                JOIN flashcards f ON ser.card_id = f.id
                LEFT JOIN card_review_state crs ON ser.card_id = crs.card_id AND ser.user_id = crs.user_id
                WHERE ser.user_id=%s
                GROUP BY f.id, f.question, f.deck_id, f.topic_id, crs.lapse_count, crs.interval
                HAVING SUM(ser.total_reviews) > 0
                ORDER BY (SUM(ser.again_count + ser.hard_count)::float / SUM(ser.total_reviews)) DESC, SUM(ser.total_reviews) DESC
                LIMIT 10
                """,
                (user_id,)
            )
            rows = await cur.fetchall()
            
        results = []
        for r in rows:
            card_id, question, deck_id, topic_id, total, struggles, lapse_count, interval, avg_time = r
            struggle_rate = struggles / total if total > 0 else 0
            weakness_score = struggle_rate * math.log(total + 1) * 10
            results.append(WeakCard(
                card_id=str(card_id),
                question=question,
                deck_id=deck_id,
                topic_id=str(topic_id) if topic_id else None,
                total_reviews=total,
                struggle_reviews=struggles,
                struggle_rate=struggle_rate,
                avg_response_time=avg_time,
                lapse_count=lapse_count,
                interval=interval,
                weakness_score=weakness_score
            ))
        return results
    except Exception as e:
        print(f"Error in weak_cards: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/weak-tags")
async def weak_tags(user_id: str = Depends(get_request_user_uid)) -> List[WeakTag]:
    if not is_db_available():
        # Mock data for degraded mode
        return [
            WeakTag(tag_id=1, tag="hard", quiz_accuracy=0.2, quiz_accuracy_pct=20, flashcard_difficulty=0.8, flashcard_difficulty_pct=80, weakness_score=90, flashcard_count=15),
            WeakTag(tag_id=2, tag="urgent", quiz_accuracy=0.5, quiz_accuracy_pct=50, flashcard_difficulty=0.6, flashcard_difficulty_pct=60, weakness_score=70, flashcard_count=10),
            WeakTag(tag_id=3, tag="exam-prep", quiz_accuracy=0.8, quiz_accuracy_pct=80, flashcard_difficulty=0.3, flashcard_difficulty_pct=30, weakness_score=40, flashcard_count=25),
        ]
    
    # Real implementation
    try:
        async with db_conn() as (conn, cur):
            # Join flashcard_tags, flashcards, study_event_rollups_card_daily
            # Calculate weakness score per tag
            await cur.execute("""
                SELECT 
                    t.id, 
                    t.name,
                    COUNT(DISTINCT f.id) as card_count,
                    SUM(ser.again_count + ser.hard_count) as struggle_count,
                    CASE WHEN SUM(ser.total_reviews) > 0 THEN SUM(ser.total_response_time_ms) / SUM(ser.total_reviews) ELSE 0 END as avg_time
                FROM tags t
                JOIN flashcard_tags ft ON t.id = ft.tag_id
                JOIN flashcards f ON ft.flashcard_id = f.id
                JOIN study_event_rollups_card_daily ser ON f.id = ser.card_id
                WHERE ser.user_id = %s
                GROUP BY t.id, t.name
                HAVING COUNT(DISTINCT f.id) > 0
                ORDER BY struggle_count DESC
                LIMIT 10
            """, (user_id,))
            rows = await cur.fetchall()
            
        results = []
        for r in rows:
            tag_id, name, card_count, struggle_count, avg_time = r
            difficulty = struggle_count / card_count if card_count > 0 else 0
            results.append(WeakTag(
                tag_id=tag_id,
                tag=name,
                quiz_accuracy=0, # Placeholder
                quiz_accuracy_pct=0,
                flashcard_difficulty=difficulty,
                flashcard_difficulty_pct=difficulty * 100,
                weakness_score=difficulty * 10,
                flashcard_count=card_count
            ))
        return results
    except Exception as e:
        print(f"Error in weak_tags: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/tag/{tag_id}")
async def tag_analytics(tag_id: int, user_id: str = Depends(get_request_user_uid)) -> Dict[str, Any]:
    # Placeholder implementation
    return {
        "tag_id": tag_id,
        "tag": "Unknown",
        "quiz_accuracy": 0,
        "quiz_accuracy_pct": 0,
        "flashcard_difficulty": 0,
        "flashcard_difficulty_pct": 0,
        "weakness_score": 0,
        "quiz_question_count": 0,
        "flashcard_count": 0,
    }

@router.get("/quiz-breakdown/{attempt_id}")
async def quiz_breakdown(attempt_id: str, user_id: str = Depends(get_request_user_uid)) -> QuizBreakdown:
    # Placeholder implementation
    return QuizBreakdown(
        attempt_id=attempt_id,
        struggled_tags=[],
        by_tag=[]
    )
