from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.db import db_conn, is_db_available
from app.dependencies import get_request_user_uid

router = APIRouter(prefix="/api/study-sessions", tags=["study-sessions"])
_schema_checked = False


class StudySessionStart(BaseModel):
    class_id: Optional[int] = None
    mode: Optional[str] = Field(default="study", max_length=32)


class StudySessionHeartbeat(BaseModel):
    accumulated_seconds: int = Field(ge=0)
    duration_seconds: Optional[int] = Field(default=None, ge=0)
    cards_seen: Optional[int] = None
    cards_completed: Optional[int] = None
    correct_count: Optional[int] = None
    incorrect_count: Optional[int] = None


class StudySessionEnd(BaseModel):
    accumulated_seconds: Optional[int] = Field(default=None, ge=0)
    duration_seconds: Optional[int] = Field(default=None, ge=0)


async def _ensure_session_schema() -> None:
    global _schema_checked
    if _schema_checked:
        return
    if not is_db_available():
        return
        
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS study_sessions (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id TEXT NOT NULL,
              class_id INTEGER,
              mode TEXT NOT NULL DEFAULT 'study',
              started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              ended_at TIMESTAMPTZ,
              duration_seconds INTEGER NOT NULL DEFAULT 0,
              active_seconds INTEGER NOT NULL DEFAULT 0,
              last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              cards_seen INTEGER,
              cards_completed INTEGER,
              correct_count INTEGER,
              incorrect_count INTEGER,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await cur.execute(
            "CREATE INDEX IF NOT EXISTS study_sessions_user_idx ON study_sessions (user_id, started_at DESC)"
        )
        await cur.execute(
            "CREATE INDEX IF NOT EXISTS study_sessions_user_class_idx ON study_sessions (user_id, class_id, ended_at)"
        )
        await conn.commit()
    _schema_checked = True


def _row_to_dict(row: Any) -> Dict[str, Any]:
    cols = [
        "id",
        "user_id",
        "class_id",
        "mode",
        "started_at",
        "ended_at",
        "duration_seconds",
        "active_seconds",
        "last_active_at",
        "cards_seen",
        "cards_completed",
        "correct_count",
        "incorrect_count",
        "created_at",
        "updated_at",
    ]
    return dict(zip(cols, row))


@router.post("/start")
async def start_session(payload: StudySessionStart, user_id: str = Depends(get_request_user_uid)):
    if not is_db_available():
        # Mock data for degraded mode
        return {
            "id": "mock-session-id-123",
            "user_id": user_id,
            "class_id": payload.class_id,
            "mode": payload.mode,
            "started_at": datetime.utcnow(),
            "ended_at": None,
            "duration_seconds": 0,
            "active_seconds": 0,
            "last_active_at": datetime.utcnow(),
            "cards_seen": 0,
            "cards_completed": 0,
            "correct_count": 0,
            "incorrect_count": 0,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        
    await _ensure_session_schema()
    now = datetime.utcnow()
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT id, user_id, class_id, mode, started_at, ended_at, duration_seconds,
                   active_seconds, last_active_at, cards_seen, cards_completed, correct_count,
                   incorrect_count, created_at, updated_at
            FROM study_sessions
            WHERE user_id=%s
              AND (%s::int IS NULL OR class_id=%s::int)
              AND mode=%s
              AND ended_at IS NULL
              AND last_active_at >= %s
            ORDER BY started_at DESC
            LIMIT 1
            """,
            (
                user_id,
                payload.class_id,
                payload.class_id,
                payload.mode or "study",
                now - timedelta(minutes=30),
            ),
        )
        row = await cur.fetchone()
        
        # Check if session spans midnight
        if row:
            session_data = _row_to_dict(row)
            started_at = session_data["started_at"]
            # Ensure started_at is offset-naive UTC or handle timezone
            if started_at.tzinfo:
                started_at = started_at.astimezone(None).replace(tzinfo=None) # Convert to naive UTC
            
            if started_at.date() < now.date():
                # Session is from previous day. Close it.
                end_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
                duration = int((end_date - started_at).total_seconds())
                await cur.execute(
                    """
                    UPDATE study_sessions
                    SET ended_at=%s, duration_seconds=%s, updated_at=now()
                    WHERE id=%s
                    """,
                    (end_date, duration, session_data["id"])
                )
                # Fall through to create new session
                row = None
            else:
                return session_data

        if not row:
            await cur.execute(
                """
                INSERT INTO study_sessions (user_id, class_id, mode, last_active_at)
                VALUES (%s, %s, %s, %s)
                RETURNING id, user_id, class_id, mode, started_at, ended_at, duration_seconds,
                          active_seconds, last_active_at, cards_seen, cards_completed, correct_count,
                          incorrect_count, created_at, updated_at
                """,
                (user_id, payload.class_id, payload.mode or "study", now),
            )
            row = await cur.fetchone()
            await conn.commit()
    return _row_to_dict(row)


@router.patch("/{session_id}/heartbeat")
async def heartbeat_session(
    session_id: str, payload: StudySessionHeartbeat, user_id: str = Depends(get_request_user_uid)
):
    if not is_db_available():
        # Mock data for degraded mode
        return {
            "id": session_id,
            "user_id": user_id,
            "class_id": None,
            "mode": "study",
            "started_at": datetime.utcnow(),
            "ended_at": None,
            "duration_seconds": payload.accumulated_seconds,
            "active_seconds": payload.accumulated_seconds,
            "last_active_at": datetime.utcnow(),
            "cards_seen": payload.cards_seen,
            "cards_completed": payload.cards_completed,
            "correct_count": payload.correct_count,
            "incorrect_count": payload.incorrect_count,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

    await _ensure_session_schema()
    now = datetime.utcnow()
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE study_sessions
            SET active_seconds=GREATEST(active_seconds, %s),
                duration_seconds=GREATEST(duration_seconds, %s),
                last_active_at=now(),
                cards_seen=COALESCE(%s, cards_seen),
                cards_completed=COALESCE(%s, cards_completed),
                correct_count=COALESCE(%s, correct_count),
                incorrect_count=COALESCE(%s, incorrect_count),
                updated_at=now()
            WHERE id=%s AND user_id=%s AND ended_at IS NULL
            RETURNING id, user_id, class_id, mode, started_at, ended_at, duration_seconds,
                      active_seconds, last_active_at, cards_seen, cards_completed, correct_count,
                      incorrect_count, created_at, updated_at
            """,
            (
                payload.accumulated_seconds,
                payload.duration_seconds if payload.duration_seconds is not None else payload.accumulated_seconds,
                payload.cards_seen,
                payload.cards_completed,
                payload.correct_count,
                payload.incorrect_count,
                session_id,
                user_id,
            ),
        )
        row = await cur.fetchone()
        
        if row:
            # Check for midnight crossing
            session_data = _row_to_dict(row)
            started_at = session_data["started_at"]
            if started_at.tzinfo:
                started_at = started_at.astimezone(None).replace(tzinfo=None)
            
            if started_at.date() < now.date():
                # Session spans midnight. Close old, start new.
                end_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
                duration = int((end_date - started_at).total_seconds())
                
                # Close old session
                await cur.execute(
                    """
                    UPDATE study_sessions
                    SET ended_at=%s, duration_seconds=%s, updated_at=now()
                    WHERE id=%s
                    """,
                    (end_date, duration, session_data["id"])
                )
                
                # Create new session
                # Reset counters for new session
                await cur.execute(
                    """
                    INSERT INTO study_sessions (user_id, class_id, mode, last_active_at)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id, user_id, class_id, mode, started_at, ended_at, duration_seconds,
                              active_seconds, last_active_at, cards_seen, cards_completed, correct_count,
                              incorrect_count, created_at, updated_at
                    """,
                    (user_id, session_data["class_id"], session_data["mode"], now),
                )
                row = await cur.fetchone()

        await conn.commit()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found or already ended.")
    return _row_to_dict(row)


@router.post("/{session_id}/end")
async def end_session(session_id: str, payload: StudySessionEnd, user_id: str = Depends(get_request_user_uid)):
    if not is_db_available():
        # Mock data for degraded mode
        return {
            "id": session_id,
            "user_id": user_id,
            "class_id": None,
            "mode": "study",
            "started_at": datetime.utcnow(),
            "ended_at": datetime.utcnow(),
            "duration_seconds": payload.accumulated_seconds or 0,
            "active_seconds": payload.accumulated_seconds or 0,
            "last_active_at": datetime.utcnow(),
            "cards_seen": 0,
            "cards_completed": 0,
            "correct_count": 0,
            "incorrect_count": 0,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

    await _ensure_session_schema()
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE study_sessions
            SET ended_at=now(),
                duration_seconds=GREATEST(duration_seconds, COALESCE(%s, active_seconds, 0)),
                active_seconds=GREATEST(active_seconds, COALESCE(%s, 0)),
                updated_at=now()
            WHERE id=%s AND user_id=%s AND ended_at IS NULL
            RETURNING id, user_id, class_id, mode, started_at, ended_at, duration_seconds,
                      active_seconds, last_active_at, cards_seen, cards_completed, correct_count,
                      incorrect_count, created_at, updated_at
            """,
            (
                payload.duration_seconds if payload.duration_seconds is not None else payload.accumulated_seconds,
                payload.accumulated_seconds,
                session_id,
                user_id
            ),
        )
        row = await cur.fetchone()
        await conn.commit()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found or already ended.")
    return _row_to_dict(row)


@router.get("/overview")
async def sessions_overview(from_date: Optional[str] = Query(None), user_id: str = Depends(get_request_user_uid)):
    try:
        if not is_db_available():
            return {
                "total_seconds_today": 0,
                "total_duration_today": 0,
                "total_seconds_7d": 0,
                "total_seconds_30d": 0,
                "total_seconds_all": 0,
                "sessions_7d": 0,
                "sessions_30d": 0,
                "sessions_all": 0,
                "avg_seconds_7d": 0.0,
                "avg_seconds_30d": 0.0,
                "avg_seconds_all": 0.0,
            }

        await _ensure_session_schema()
        async with db_conn() as (conn, cur):
            if from_date:
                 today_clause = "started_at >= %s::timestamptz"
                 # parameters order: first filter, second filter, user_id
                 query_params = [from_date, from_date, user_id]
            else:
                 today_clause = "started_at >= date_trunc('day', now())"
                 query_params = [user_id]
                 
            await cur.execute(
                f"""
                SELECT
                  COALESCE(SUM(active_seconds) FILTER (WHERE {today_clause}), 0) AS total_today,
                  COALESCE(SUM(duration_seconds) FILTER (WHERE {today_clause}), 0) AS duration_today,
                  COALESCE(SUM(active_seconds) FILTER (WHERE started_at >= now() - interval '7 days'), 0) AS total_7d,
                  COALESCE(SUM(active_seconds) FILTER (WHERE started_at >= now() - interval '30 days'), 0) AS total_30d,
                  COALESCE(SUM(active_seconds), 0) AS total_all,
                  COALESCE(COUNT(*) FILTER (WHERE started_at >= now() - interval '7 days'), 0) AS sessions_7d,
                  COALESCE(COUNT(*) FILTER (WHERE started_at >= now() - interval '30 days'), 0) AS sessions_30d,
                  COALESCE(COUNT(*), 0) AS sessions_all
                FROM study_sessions
                WHERE user_id=%s
                """,
                tuple(query_params),
            )
            row = await cur.fetchone()
        
        total_today, duration_today, total_7d, total_30d, total_all, sessions_7d, sessions_30d, sessions_all = row or (0, 0, 0, 0, 0, 0, 0, 0)
        
        def avg(total: int, count: int) -> float:
            return float(total) / count if count else 0.0
            
        return {
            "total_seconds_today": int(total_today),
            "total_duration_today": int(duration_today),
            "total_seconds_7d": int(total_7d),
            "total_seconds_30d": int(total_30d),
            "total_seconds_all": int(total_all),
            "sessions_7d": int(sessions_7d),
            "sessions_30d": int(sessions_30d),
            "sessions_all": int(sessions_all),
            "avg_seconds_7d": avg(total_7d, sessions_7d),
            "avg_seconds_30d": avg(total_30d, sessions_30d),
            "avg_seconds_all": avg(total_all, sessions_all),
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/trends")
async def sessions_trends(days: int = 14, user_id: str = Depends(get_request_user_uid)):
    await _ensure_session_schema()
    days = max(1, min(90, days))
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT
              date_trunc('day', started_at)::date AS day,
              COALESCE(SUM(duration_seconds), 0) AS total_duration,
              COALESCE(SUM(active_seconds), 0) AS total_active,
              COUNT(*) AS sessions
            FROM study_sessions
            WHERE user_id=%s AND started_at >= now() - (%s || ' days')::interval
            GROUP BY 1
            ORDER BY 1 ASC
            """,
            (user_id, days),
        )
        rows = await cur.fetchall()
    return [
        {
            "day": str(row[0]),
            "total_seconds": int(row[1]), # Keeping for backward compat, mapped to duration
            "active_seconds": int(row[2]),
            "sessions": int(row[3])
        }
        for row in rows
    ]


@router.get("/recent")
async def recent_sessions(limit: int = 10, user_id: str = Depends(get_request_user_uid)):
    await _ensure_session_schema()
    limit = max(1, min(25, limit))
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT
              s.id,
              s.user_id,
              s.class_id,
              s.mode,
              s.started_at,
              s.ended_at,
              s.duration_seconds,
              s.active_seconds,
              s.last_active_at,
              s.cards_seen,
              s.cards_completed,
              s.correct_count,
              s.incorrect_count,
              s.created_at,
              s.updated_at,
              c.name AS class_name
            FROM study_sessions s
            LEFT JOIN classes c ON c.id = s.class_id AND c.owner_uid = s.user_id
            WHERE s.user_id=%s
            ORDER BY s.started_at DESC
            LIMIT %s
            """,
            (user_id, limit),
        )
        rows = await cur.fetchall()
    sessions: List[Dict[str, Any]] = []
    for row in rows:
        # row has 16 columns: 0..14 are session fields, 15 is class_name
        data = _row_to_dict(row[:15])
        data["class_name"] = row[15]
        sessions.append(data)
    return sessions
