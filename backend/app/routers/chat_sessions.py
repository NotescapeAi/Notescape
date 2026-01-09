from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
import logging
from psycopg.types.json import Json
from pydantic import BaseModel, Field

from app.core.db import db_conn
from app.dependencies import get_request_user_uid

router = APIRouter(prefix="/api/chat", tags=["chat"])
_schema_checked = False
log = logging.getLogger("uvicorn.error")


async def _ensure_chat_schema():
    global _schema_checked
    if _schema_checked:
        return
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_sessions (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id TEXT NOT NULL,
              class_id INT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
              title TEXT NOT NULL DEFAULT 'New chat',
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
              role TEXT NOT NULL CHECK (role IN ('user','assistant')),
              content TEXT NOT NULL,
              citations JSONB,
              selected_text TEXT,
              file_id UUID REFERENCES files(id) ON DELETE SET NULL,
              file_scope JSONB,
              image_attachment JSONB,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await cur.execute("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS selected_text TEXT")
        await cur.execute("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_id UUID REFERENCES files(id) ON DELETE SET NULL")
        await cur.execute("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_scope JSONB")
        await cur.execute("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS image_attachment JSONB")
        await cur.execute("CREATE INDEX IF NOT EXISTS chat_sessions_user_class_idx ON chat_sessions (user_id, class_id, updated_at DESC)")
        await cur.execute("CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages (session_id, created_at ASC)")
        await conn.commit()
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='chat_messages'
            """
        )
        cols = {r[0] for r in await cur.fetchall()}
    required = {"selected_text", "file_id", "file_scope", "image_attachment"}
    _schema_checked = required.issubset(cols)
    if not _schema_checked:
        log.warning(f"[chat] schema incomplete, missing: {sorted(list(required - cols))}")


class ChatSessionCreate(BaseModel):
    class_id: int
    title: Optional[str] = Field(default="New chat")


class ChatMessageCreate(BaseModel):
    user_content: str
    assistant_content: str
    citations: Optional[List[Dict[str, Any]]] = None
    selected_text: Optional[str] = None
    file_id: Optional[str] = None
    file_scope: Optional[List[str]] = None
    image_attachment: Optional[Dict[str, Any]] = None


async def _ensure_class_owner(class_id: int, user_id: str):
    await _ensure_chat_schema()
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT 1 FROM classes WHERE id=%s AND owner_uid=%s",
            (class_id, user_id),
        )
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Class not found")


@router.post("/sessions")
async def create_session(payload: ChatSessionCreate, user_id: str = Depends(get_request_user_uid)):
    await _ensure_chat_schema()
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
    await _ensure_chat_schema()
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
    await _ensure_chat_schema()
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
        if _schema_checked:
            await cur.execute(
                """
                SELECT id::text, role, content, citations, selected_text, file_id::text, file_scope, image_attachment, created_at
                FROM chat_messages
                WHERE session_id=%s
                ORDER BY created_at ASC
                """,
                (session_id,),
            )
        else:
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
    msg_cols = (
        ["id", "role", "content", "citations", "selected_text", "file_id", "file_scope", "image_attachment", "created_at"]
        if _schema_checked
        else ["id", "role", "content", "citations", "created_at"]
    )
    return {
        "session": dict(zip(sess_cols, sess)),
        "messages": [dict(zip(msg_cols, m)) for m in msgs],
    }


@router.get("/sessions/{session_id}/messages")
async def list_session_messages(session_id: str, user_id: str = Depends(get_request_user_uid)):
    await _ensure_chat_schema()
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT 1
            FROM chat_sessions
            WHERE id=%s AND user_id=%s
            """,
            (session_id, user_id),
        )
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")
        if _schema_checked:
            await cur.execute(
                """
                SELECT id::text, role, content, citations, selected_text, file_id::text, file_scope, image_attachment, created_at
                FROM chat_messages
                WHERE session_id=%s
                ORDER BY created_at ASC
                """,
                (session_id,),
            )
        else:
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
    log.info(f"[chat] list_messages session_id={session_id} count={len(msgs)}")
    msg_cols = (
        ["id", "role", "content", "citations", "selected_text", "file_id", "file_scope", "image_attachment", "created_at"]
        if _schema_checked
        else ["id", "role", "content", "citations", "created_at"]
    )
    return [dict(zip(msg_cols, m)) for m in msgs]


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    class_id: Optional[int] = Query(default=None),
    user_id: str = Depends(get_request_user_uid),
):
    await _ensure_chat_schema()
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT class_id
            FROM chat_sessions
            WHERE id=%s AND user_id=%s
            """,
            (session_id, user_id),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        if class_id is not None and row[0] != class_id:
            raise HTTPException(status_code=404, detail="Session not found")
        await cur.execute("DELETE FROM chat_sessions WHERE id=%s", (session_id,))
        await conn.commit()
    return {"ok": True, "session_id": session_id}


@router.delete("/sessions/{session_id}/messages")
async def clear_session_messages(session_id: str, user_id: str = Depends(get_request_user_uid)):
    await _ensure_chat_schema()
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT 1
            FROM chat_sessions
            WHERE id=%s AND user_id=%s
            """,
            (session_id, user_id),
        )
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")
        await cur.execute("DELETE FROM chat_messages WHERE session_id=%s", (session_id,))
        await conn.commit()
    return {"ok": True, "session_id": session_id}


@router.post("/sessions/{session_id}/messages")
async def add_messages(session_id: str, payload: ChatMessageCreate, user_id: str = Depends(get_request_user_uid)):
    await _ensure_chat_schema()
    file_scope_json = Json(payload.file_scope) if payload.file_scope is not None else None
    image_attachment_json = Json(payload.image_attachment) if payload.image_attachment is not None else None
    citations_json = Json(payload.citations) if payload.citations is not None else None
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT class_id FROM chat_sessions WHERE id=%s AND user_id=%s",
            (session_id, user_id),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        class_id = row[0]
        if payload.file_id:
            await cur.execute(
                "SELECT 1 FROM files WHERE id=%s AND class_id=%s",
                (payload.file_id, class_id),
            )
            if not await cur.fetchone():
                raise HTTPException(status_code=404, detail="File not found in class")
        if _schema_checked:
            await cur.execute(
                """
                INSERT INTO chat_messages (session_id, role, content, citations, selected_text, file_id, file_scope, image_attachment)
                VALUES (%s, 'user', %s, NULL, %s, %s, %s, %s)
                """,
                (session_id, payload.user_content, payload.selected_text, payload.file_id, file_scope_json, image_attachment_json),
            )
            await cur.execute(
                """
                INSERT INTO chat_messages (session_id, role, content, citations, selected_text, file_id, file_scope, image_attachment)
                VALUES (%s, 'assistant', %s, %s, NULL, NULL, %s, NULL)
                """,
                (session_id, payload.assistant_content, citations_json, file_scope_json),
            )
        else:
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
                (session_id, payload.assistant_content, citations_json),
            )
        await cur.execute(
            "UPDATE chat_sessions SET updated_at=now() WHERE id=%s",
            (session_id,),
        )
        await conn.commit()
    async with db_conn() as (conn, cur):
        if _schema_checked:
            await cur.execute(
                """
                SELECT id::text, role, content, citations, selected_text, file_id::text, file_scope, image_attachment, created_at
                FROM chat_messages
                WHERE session_id=%s
                ORDER BY created_at ASC
                """,
                (session_id,),
            )
        else:
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
    log.info(f"[chat] add_messages session_id={session_id} saved=2 total={len(msgs)}")
    msg_cols = (
        ["id", "role", "content", "citations", "selected_text", "file_id", "file_scope", "image_attachment", "created_at"]
        if _schema_checked
        else ["id", "role", "content", "citations", "created_at"]
    )
    return {"ok": True, "messages": [dict(zip(msg_cols, m)) for m in msgs]}
