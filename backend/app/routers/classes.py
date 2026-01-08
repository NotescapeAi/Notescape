# backend/app/routers/classes.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging
from app.core.db import db_conn
from app.dependencies import get_current_user_uid

logging.getLogger("uvicorn.error").info(f"Loaded classes router from {__file__}")

router = APIRouter(prefix="/api/classes", tags=["classes"])

class ClassCreate(BaseModel):
    name: str
    subject: Optional[str] = None

class ClassUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None

@router.get("")  # GET /api/classes
async def list_classes(user_uid: str = Depends(get_current_user_uid)) -> List[Dict[str, Any]]:
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT id, name, subject, created_at FROM classes "
            "WHERE owner_uid = %s ORDER BY created_at DESC",
            (user_uid,),
        )
        rows = await cur.fetchall()
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in rows]


@router.post("")  # POST /api/classes
async def create_class(
    payload: ClassCreate, user_uid: str = Depends(get_current_user_uid)
):
    subject = (payload.subject or "").strip() or "General"
    async with db_conn() as (conn, cur):
        await cur.execute(
            "INSERT INTO classes (name, subject, owner_uid) VALUES (%s, %s, %s) "
            "RETURNING id, name, subject, created_at",
            (payload.name, subject, user_uid),
        )
        row = await cur.fetchone()
        await conn.commit()
    cols = ["id", "name", "subject", "created_at"]
    return dict(zip(cols, row))


@router.put("/{class_id}")  # PUT /api/classes/{class_id}
async def update_class(
    class_id: int, payload: ClassUpdate, user_uid: str = Depends(get_current_user_uid)
):
    fields, values = [], []
    if payload.name is not None:
        fields.append("name=%s")
        values.append(payload.name)
    if payload.subject is not None:
        fields.append("subject=%s")
        values.append((payload.subject or "").strip() or "General")
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    values.append(class_id)
    values.append(user_uid)  # For ownership check
    async with db_conn() as (conn, cur):
        await cur.execute(
            f"UPDATE classes SET {', '.join(fields)} "
            "WHERE id=%s AND owner_uid=%s RETURNING id, name, subject, created_at",
            tuple(values),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Class not found or not owned by you")
        await conn.commit()
    cols = ["id", "name", "subject", "created_at"]
    return dict(zip(cols, row))


@router.delete("/{class_id}", status_code=204)  # DELETE /api/classes/{class_id}
async def delete_class(class_id: int, user_uid: str = Depends(get_current_user_uid)):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "DELETE FROM classes WHERE id=%s AND owner_uid=%s",
            (class_id, user_uid),
        )
        await conn.commit()
    return

