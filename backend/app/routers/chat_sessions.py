from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.db import db_conn
from app.dependencies import get_request_user_uid

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatSessionCreate(BaseModel):
    class_id: int
    title: Optional[str] = Field(default="New chat")


class ChatMessageCreate(BaseModel):
    user_content: str
    assistant_content: str
    citations: Optional[Dict[str, Any]] = None


async def _ensure_class_owner(class_id: int, user_id: str):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT 1 FROM classes WHERE id=%s AND owner_uid=%s",
            (class_id, user_id),
        )
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Class not found")


@router.post("/sessions")
async def create_session(payload: ChatSessionCreate, user_id: str = Depends(get_request_user_uid)):
    await _ensure_class_owner(payload.class_id, user_id)
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            INSERT INTO chat_sessions (user_id, class_id, title)
            VALUES (%s, %s, %s)
            RETURNING id::text, class_id, title, created_at, updated_at
            """,
            (user_id, payload.class_id, payload.title or "New chat"),
        )
        row = await cur.fetchone()
        await conn.commit()
    cols = ["id", "class_id", "title", "created_at", "updated_at"]
    return dict(zip(cols, row))


@router.get("/sessions")
async def list_sessions(class_id: int, user_id: str = Depends(get_request_user_uid)):
    await _ensure_class_owner(class_id, user_id)
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT id::text, class_id, title, created_at, updated_at
            FROM chat_sessions
            WHERE user_id=%s AND class_id=%s
            ORDER BY updated_at DESC
            """,
            (user_id, class_id),
        )
        rows = await cur.fetchall()
    cols = ["id", "class_id", "title", "created_at", "updated_at"]
    return [dict(zip(cols, r)) for r in rows]


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, user_id: str = Depends(get_request_user_uid)):
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT id::text, class_id, title, created_at, updated_at
            FROM chat_sessions
            WHERE id=%s AND user_id=%s
            """,
            (session_id, user_id),
        )
        sess = await cur.fetchone()
        if not sess:
            raise HTTPException(status_code=404, detail="Session not found")
        await cur.execute(
            """
            SELECT id::text, role, content, citations, created_at
            FROM chat_messages
            WHERE session_id=%s
            ORDER BY created_at ASC
            """,
            (session_id,),
        )
        msgs = await cur.fetchall()
    sess_cols = ["id", "class_id", "title", "created_at", "updated_at"]
    msg_cols = ["id", "role", "content", "citations", "created_at"]
    return {
        "session": dict(zip(sess_cols, sess)),
        "messages": [dict(zip(msg_cols, m)) for m in msgs],
    }


@router.post("/sessions/{session_id}/messages")
async def add_messages(session_id: str, payload: ChatMessageCreate, user_id: str = Depends(get_request_user_uid)):
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT class_id FROM chat_sessions WHERE id=%s AND user_id=%s",
            (session_id, user_id),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        await cur.execute(
            """
            INSERT INTO chat_messages (session_id, role, content, citations)
            VALUES (%s, 'user', %s, NULL)
            """,
            (session_id, payload.user_content),
        )
        await cur.execute(
            """
            INSERT INTO chat_messages (session_id, role, content, citations)
            VALUES (%s, 'assistant', %s, %s)
            """,
            (session_id, payload.assistant_content, payload.citations),
        )
        await cur.execute(
            "UPDATE chat_sessions SET updated_at=now() WHERE id=%s",
            (session_id,),
        )
        await conn.commit()
    return {"ok": True}
