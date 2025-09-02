# app/routers/classes.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging
from app.core.db import db_conn

logging.getLogger("uvicorn.error").info(f"Loaded classes router from {__file__}")

router = APIRouter(prefix="/api/classes", tags=["classes"])

class ClassCreate(BaseModel):
    name: str
    subject: Optional[str] = None

class ClassUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None

@router.get("")  # GET /api/classes
async def list_classes() -> List[Dict[str, Any]]:
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT id, name, subject, created_at FROM classes ORDER BY created_at DESC"
        )
        rows = await cur.fetchall()
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in rows]

@router.post("")  # POST /api/classes
async def create_class(payload: ClassCreate):
    subject = (payload.subject or "").strip() or "General"
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

@router.put("/{class_id}")  # PUT /api/classes/{class_id}
async def update_class(class_id: int, payload: ClassUpdate):
    fields, values = [], []
    if payload.name is not None:
        fields.append("name=%s")
        values.append(payload.name)
    if payload.subject is not None:
        values.append((payload.subject or "").strip() or "General")
        fields.append("subject=%s")
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

@router.delete("/{class_id}", status_code=204)  # DELETE /api/classes/{class_id}
async def delete_class(class_id: int):
    async with db_conn() as (conn, cur):
        await cur.execute("DELETE FROM classes WHERE id=%s", (class_id,))
        await conn.commit()
    return
