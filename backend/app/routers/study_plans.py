import datetime as dt
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Path

from app.core.db import db_conn
from app.dependencies import get_request_user_uid
from app.routers.analytics import _class_topic_mastery_rows, _readiness_from_rows, _class_topic_universe

router = APIRouter(prefix="/api/study-plans", tags=["study-plans"])
classes_router = APIRouter(prefix="/api/classes", tags=["study-plans"])


async def _ensure_class_owner(cur, class_id: int, user_id: str) -> str:
    if user_id == "dev-user":
        await cur.execute("SELECT name FROM classes WHERE id=%s", (class_id,))
    else:
        await cur.execute("SELECT name FROM classes WHERE id=%s AND owner_uid=%s", (class_id, user_id))
    row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Class not found")
    return row[0]


def _default_title(goal: str, class_name: str, exam_date: Optional[dt.date]) -> str:
    goal_label = goal.replace("_", " ").title()
    suffix = f" - {exam_date.isoformat()}" if exam_date else ""
    return f"{goal_label} | {class_name}{suffix}"


def _generate_plan_items(
    start_date: dt.date,
    days: int,
    daily_time_minutes: int,
    topics: List[Dict[str, Any]],
    goal: str,
    preferred_mode: str,
    exam_date: Optional[dt.date],
) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    if days <= 0:
        days = 1
    slots_per_day = max(2, min(4, daily_time_minutes // 20 if daily_time_minutes else 3))
    weak_topics = topics[: max(1, min(5, len(topics)))]
    general_topics = topics if topics else [{"topic": "General", "reason": "No performance data yet"}]

    for day_offset in range(days):
        day_date = start_date + dt.timedelta(days=day_offset)
        focus_pool = weak_topics if weak_topics else general_topics
        topic_idx = day_offset % len(focus_pool)
        topic = focus_pool[topic_idx]
        topic_name = topic.get("topic") or "General"
        reason = topic.get("reason") or "Based on recent performance"
        priority = "high" if (exam_date and (exam_date - day_date).days <= 3) else "medium"

        # Build a small mix of tasks
        task_mix = []
        if preferred_mode in ("flashcards", "mixed", ""):
            task_mix.append(("flashcards", f"Review flashcards on {topic_name}", 15))
        if preferred_mode in ("quiz", "mixed", "voice_revision"):
            task_mix.append(("quiz", f"Quiz on {topic_name}", 15))
        if preferred_mode in ("voice_revision", "mixed"):
            task_mix.append(("voice_revision", f"Hands-free revision for {topic_name}", 12))
        task_mix.append(("chatbot_review", f"Ask Study Assistant about {topic_name}", 10))

        for slot_idx in range(min(slots_per_day, len(task_mix))):
            ttype, title, est = task_mix[slot_idx]
            items.append(
                {
                    "date": day_date,
                    "topic": topic_name,
                    "task_type": ttype,
                    "title": title,
                    "description": reason,
                    "estimated_minutes": est,
                    "priority": priority,
                    "reason": reason,
                }
            )

        # Add a spaced mock/review towards the end
        if day_offset == max(0, days - 2):
            items.append(
                {
                    "date": day_date,
                    "topic": topic_name,
                    "task_type": "mock_test",
                    "title": "Timed mock on weak areas",
                    "description": "Quick readiness check before exam.",
                    "estimated_minutes": max(20, daily_time_minutes),
                    "priority": "high",
                    "reason": "Pre-exam check",
                }
            )
    return items


@router.post("")
async def create_study_plan(payload: Dict[str, Any], user_id: str = Depends(get_request_user_uid)):
    class_id = int(payload.get("class_id") or 0)
    if class_id <= 0:
        raise HTTPException(status_code=400, detail="class_id is required")

    exam_date_raw = payload.get("exam_date")
    exam_date = dt.date.fromisoformat(exam_date_raw) if exam_date_raw else None
    daily_time_minutes = int(payload.get("daily_time_minutes") or 60)
    goal = (payload.get("goal") or "exam_preparation").replace(" ", "_")
    preferred_mode = (payload.get("preferred_mode") or "mixed").lower()
    selected_documents = payload.get("documents") or []

    async with db_conn() as (conn, cur):
        class_name = await _ensure_class_owner(cur, class_id, user_id)
        rows = await _class_topic_mastery_rows(cur, user_id, class_id, 100)
        total_topics = await _class_topic_universe(cur, class_id)
        readiness = _readiness_from_rows(rows, total_topics)

        topics_sorted = sorted(
            [
                {
                    "topic": r[0] or "General",
                    "mastery_score": float(r[12] or 0),
                    "reason": f"Mastery {round(float(r[12] or 0) * 100)}%",
                }
                for r in rows
            ],
            key=lambda x: x["mastery_score"],
        )

        today = dt.date.today()
        days = (exam_date - today).days + 1 if exam_date else int(payload.get("study_days") or 7)
        items = _generate_plan_items(
            start_date=today,
            days=max(3, min(30, days)),
            daily_time_minutes=daily_time_minutes,
            topics=topics_sorted,
            goal=goal,
            preferred_mode=preferred_mode,
            exam_date=exam_date,
        )

        title = payload.get("title") or _default_title(goal, class_name, exam_date)
        await cur.execute(
            """
            INSERT INTO study_plans (user_id, class_id, title, goal, exam_date, daily_time_minutes, preferred_mode, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            RETURNING id
            """,
            (
                user_id,
                class_id,
                title,
                goal,
                exam_date,
                daily_time_minutes,
                preferred_mode,
                {"documents": selected_documents, "readiness": readiness},
            ),
        )
        plan_id = (await cur.fetchone())[0]

        for item in items:
            await cur.execute(
                """
                INSERT INTO study_plan_items
                  (plan_id, date, topic, task_type, title, description, estimated_minutes, priority, reason)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    plan_id,
                    item["date"],
                    item["topic"],
                    item["task_type"],
                    item["title"],
                    item.get("description"),
                    item.get("estimated_minutes"),
                    item.get("priority", "medium"),
                    item.get("reason"),
                ),
            )
        await conn.commit()

    return {"id": str(plan_id), "title": title, "items": len(items), "exam_date": exam_date.isoformat() if exam_date else None}


@router.get("")
async def list_study_plans(user_id: str = Depends(get_request_user_uid)):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT id, class_id, title, goal, exam_date, daily_time_minutes, preferred_mode, status, created_at, updated_at
            FROM study_plans
            WHERE user_id=%s
            ORDER BY created_at DESC
            """,
            (user_id,),
        )
        rows = await cur.fetchall()
    return [
        {
            "id": str(r[0]),
            "class_id": r[1],
            "title": r[2],
            "goal": r[3],
            "exam_date": r[4].isoformat() if r[4] else None,
            "daily_time_minutes": r[5],
            "preferred_mode": r[6],
            "status": r[7],
            "created_at": r[8].isoformat() if r[8] else None,
            "updated_at": r[9].isoformat() if r[9] else None,
        }
        for r in rows
    ]


@router.get("/{plan_id}")
async def get_study_plan(plan_id: str = Path(...), user_id: str = Depends(get_request_user_uid)):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT id, class_id, title, goal, exam_date, daily_time_minutes, preferred_mode, status FROM study_plans WHERE id::text=%s AND user_id=%s",
            (plan_id, user_id),
        )
        plan = await cur.fetchone()
        if not plan:
            raise HTTPException(status_code=404, detail="Study plan not found")
        await cur.execute(
            """
            SELECT id, date, topic, task_type, title, description, estimated_minutes, status, priority, reason
            FROM study_plan_items
            WHERE plan_id=%s
            ORDER BY date, created_at
            """,
            (plan[0],),
        )
        items = await cur.fetchall()
    return {
        "id": str(plan[0]),
        "class_id": plan[1],
        "title": plan[2],
        "goal": plan[3],
        "exam_date": plan[4].isoformat() if plan[4] else None,
        "daily_time_minutes": plan[5],
        "preferred_mode": plan[6],
        "status": plan[7],
        "items": [
            {
                "id": str(i[0]),
                "date": i[1].isoformat(),
                "topic": i[2],
                "task_type": i[3],
                "title": i[4],
                "description": i[5],
                "estimated_minutes": i[6],
                "status": i[7],
                "priority": i[8],
                "reason": i[9],
            }
            for i in items
        ],
    }


@router.patch("/{plan_id}/items/{item_id}")
async def update_plan_item(
    plan_id: str = Path(...),
    item_id: str = Path(...),
    payload: Dict[str, Any] = None,
    user_id: str = Depends(get_request_user_uid),
):
    status = (payload or {}).get("status")
    new_date_raw = (payload or {}).get("date")
    allowed_status = {"pending", "completed", "skipped", "overdue"}
    if status and status not in allowed_status:
        raise HTTPException(status_code=400, detail="Invalid status")
    new_date = dt.date.fromisoformat(new_date_raw) if new_date_raw else None

    async with db_conn() as (conn, cur):
        await cur.execute("SELECT 1 FROM study_plans WHERE id::text=%s AND user_id=%s", (plan_id, user_id))
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Plan not found")
        await cur.execute(
            """
            UPDATE study_plan_items
            SET status = COALESCE(%s, status),
                date = COALESCE(%s, date),
                updated_at = now()
            WHERE id::text=%s AND plan_id::text=%s
            RETURNING id
            """,
            (status, new_date, item_id, plan_id),
        )
        updated = await cur.fetchone()
        if not updated:
            raise HTTPException(status_code=404, detail="Task not found")
        await conn.commit()
    return {"ok": True, "item_id": item_id}


@router.post("/{plan_id}/rebalance")
async def rebalance_plan(
    plan_id: str = Path(...),
    user_id: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT id, class_id, exam_date, daily_time_minutes, goal, preferred_mode FROM study_plans WHERE id::text=%s AND user_id=%s",
            (plan_id, user_id),
        )
        plan = await cur.fetchone()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        class_id = plan[1]
        exam_date = plan[2]
        daily_time_minutes = plan[3] or 60
        goal = plan[4] or "exam_preparation"
        preferred_mode = plan[5] or "mixed"

        rows = await _class_topic_mastery_rows(cur, user_id, class_id, 100)
        total_topics = await _class_topic_universe(cur, class_id)
        topics_sorted = sorted(
            [
                {
                    "topic": r[0] or "General",
                    "mastery_score": float(r[12] or 0),
                    "reason": f"Mastery {round(float(r[12] or 0) * 100)}%",
                }
                for r in rows
            ],
            key=lambda x: x["mastery_score"],
        )

        today = dt.date.today()
        days_remaining = (exam_date - today).days + 1 if exam_date else 7

        await cur.execute(
            "DELETE FROM study_plan_items WHERE plan_id=%s AND status IN ('pending','overdue')",
            (plan_id,),
        )

        new_items = _generate_plan_items(
            start_date=today,
            days=max(2, min(21, days_remaining)),
            daily_time_minutes=daily_time_minutes,
            topics=topics_sorted,
            goal=goal,
            preferred_mode=preferred_mode,
            exam_date=exam_date,
        )
        for item in new_items:
            await cur.execute(
                """
                INSERT INTO study_plan_items
                  (plan_id, date, topic, task_type, title, description, estimated_minutes, priority, reason)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    plan_id,
                    item["date"],
                    item["topic"],
                    item["task_type"],
                    item["title"],
                    item.get("description"),
                    item.get("estimated_minutes"),
                    item.get("priority", "medium"),
                    item.get("reason"),
                ),
            )
        await conn.commit()
    return {"ok": True, "items": len(new_items)}


@router.get("/classes/{class_id}/study-plan-suggestions")
async def study_plan_suggestions(
    class_id: int = Path(..., ge=1),
    user_id: str = Depends(get_request_user_uid),
):
    async with db_conn() as (conn, cur):
        await _ensure_class_owner(cur, class_id, user_id)
        rows = await _class_topic_mastery_rows(cur, user_id, class_id, 10)
        total_topics = await _class_topic_universe(cur, class_id)
        readiness = _readiness_from_rows(rows, total_topics)

    weak_topics = [
        {"topic": r[0] or "General", "mastery_score": round(float(r[12] or 0) * 100)}
        for r in rows
        if float(r[12] or 0) < 0.6
    ]
    return {
        "default_goal": "exam_preparation",
        "recommended_daily_minutes": 45,
        "weak_topics": weak_topics[:5],
        "exam_readiness": readiness,
    }


@classes_router.get("/{class_id}/study-plan-suggestions")
async def class_study_plan_suggestions(
    class_id: int = Path(..., ge=1),
    user_id: str = Depends(get_request_user_uid),
):
    return await study_plan_suggestions(class_id, user_id)  # type: ignore[arg-type]
