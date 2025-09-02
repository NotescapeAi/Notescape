from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.core.db import db_conn

router = APIRouter(prefix="/api", tags=["classes"])

# ---- Models ---------------------------------------------------------------

class ClassCreate(BaseModel):
    name: str
    subject: Optional[str] = None  # optional from client

class ClassUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None

# ---- Routes ---------------------------------------------------------------

@router.get("/classes")
async def list_classes() -> List[Dict[str, Any]]:
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT id, name, subject, created_at "
            "FROM classes ORDER BY created_at DESC"
        )
        rows = await cur.fetchall()
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in rows]

@router.post("/classes")
async def create_class(payload: ClassCreate):
    # satisfy NOT NULL(subject) by providing a default
    subject = (payload.subject or "").strip()
    if subject == "":
        subject = "General"

    async with db_conn() as (conn, cur):
        await cur.execute(
            "INSERT INTO classes (name, subject) VALUES (%s, %s) "
            "RETURNING id, name, subject, created_at",
            (payload.name, subject),
        )
        row = await cur.fetchone()
        await conn.commit()

    cols = ["id", "name", "subject", "created_at"]
    return dict(zip(cols, row))

@router.put("/classes/{class_id}")
async def update_class(class_id: int, payload: ClassUpdate):
    # build SET clause dynamically
    fields, values = [], []
    if payload.name is not None:
        fields.append("name=%s")
        values.append(payload.name)
    if payload.subject is not None:
        subj = (payload.subject or "").strip() or "General"
        fields.append("subject=%s")
        values.append(subj)

    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    values.append(class_id)

    async with db_conn() as (conn, cur):
        await cur.execute(
            f"UPDATE classes SET {', '.join(fields)} "
            "WHERE id=%s RETURNING id, name, subject, created_at",
            tuple(values),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Class not found")
        await conn.commit()

    cols = ["id", "name", "subject", "created_at"]
    return dict(zip(cols, row))

@router.delete("/classes/{class_id}", status_code=204)
async def delete_class(class_id: int):
    async with db_conn() as (conn, cur):
        await cur.execute("DELETE FROM classes WHERE id=%s", (class_id,))
        await conn.commit()
    return
