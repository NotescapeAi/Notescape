from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
import logging
from psycopg.types.json import Json
from pydantic import BaseModel, ConfigDict, Field

from app.core.db import db_conn
from app.dependencies import get_request_user_uid

router = APIRouter(prefix="/api/chat", tags=["chat"])
alias_router = APIRouter(prefix="/api/chats", tags=["chat"])
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
              class_id INT REFERENCES classes(id) ON DELETE CASCADE,
              document_id UUID REFERENCES files(id) ON DELETE SET NULL,
              title TEXT NOT NULL DEFAULT 'Chat session',
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await cur.execute(
            "ALTER TABLE chat_sessions ALTER COLUMN title SET DEFAULT 'Chat session'"
        )
        await cur.execute("ALTER TABLE chat_sessions ALTER COLUMN class_id DROP NOT NULL")
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
              role TEXT NOT NULL CHECK (role IN ('user','assistant')),
              content TEXT NOT NULL,
              citations JSONB,
              selected_text TEXT,
              page_number INT,
              bounding_box JSONB,
              file_id UUID REFERENCES files(id) ON DELETE SET NULL,
              file_scope JSONB,
              image_attachment JSONB,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await cur.execute("ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES files(id) ON DELETE SET NULL")
        await cur.execute("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS selected_text TEXT")
        await cur.execute("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS page_number INT")
        await cur.execute("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS bounding_box JSONB")
        await cur.execute("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_id UUID REFERENCES files(id) ON DELETE SET NULL")
        await cur.execute("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS file_scope JSONB")
        await cur.execute("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS image_attachment JSONB")
        await cur.execute(
            "CREATE INDEX IF NOT EXISTS chat_sessions_user_class_doc_idx ON chat_sessions (user_id, class_id, document_id, updated_at DESC)"
        )
        await cur.execute(
            "CREATE INDEX IF NOT EXISTS chat_sessions_user_updated_idx ON chat_sessions (user_id, updated_at DESC)"
        )
        await cur.execute(
            "CREATE INDEX IF NOT EXISTS chat_sessions_user_doc_idx ON chat_sessions (user_id, document_id, updated_at DESC)"
        )
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
    required = {"selected_text", "page_number", "bounding_box", "file_id", "file_scope", "image_attachment"}
    _schema_checked = required.issubset(cols)
    if not _schema_checked:
        log.warning(f"[chat] schema incomplete, missing: {sorted(list(required - cols))}")


class ChatSessionCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    class_id: Optional[int] = Field(default=None, alias="classId")
    document_id: Optional[str] = Field(default=None, alias="documentId")
    title: Optional[str] = None


class ChatSessionUpdate(BaseModel):
    title: Optional[str] = None


class ChatMessageCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    class_id: Optional[int] = Field(default=None, alias="classId")
    document_id: Optional[str] = Field(default=None, alias="documentId")
    user_content: str
    assistant_content: Optional[str] = None
    citations: Optional[List[Dict[str, Any]]] = None
    selected_text: Optional[str] = None
    page_number: Optional[int] = None
    bounding_box: Optional[Dict[str, Any]] = None
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


async def _ensure_file_owner(document_id: str, user_id: str, class_id: Optional[int] = None) -> int:
    await _ensure_chat_schema()
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT f.class_id
            FROM files f
            JOIN classes c ON c.id=f.class_id
            WHERE f.id=%s AND c.owner_uid=%s AND (%s::int IS NULL OR f.class_id=%s::int)
            """,
            (document_id, user_id, class_id, class_id),
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="File not found")
    return int(row[0])


@router.post("/sessions")
async def create_session(payload: ChatSessionCreate, user_id: str = Depends(get_request_user_uid)):
    await _ensure_chat_schema()
    class_id = payload.class_id
    if class_id is not None:
        await _ensure_class_owner(class_id, user_id)
    if payload.document_id:
        owner_class_id = await _ensure_file_owner(payload.document_id, user_id, class_id)
        class_id = class_id or owner_class_id
    async with db_conn() as (conn, cur):
        title = (payload.title or "Chat session").strip() or "Chat session"
        await cur.execute(
            """
            INSERT INTO chat_sessions (user_id, class_id, document_id, title)
            VALUES (%s, %s, %s, %s)
            RETURNING id::text, class_id, document_id::text, title, created_at, updated_at
            """,
            (user_id, class_id, payload.document_id, title),
        )
        row = await cur.fetchone()
        await conn.commit()
    log.info(
        "[CHAT_API] create chat user_id=%s session_id=%s class_id=%s document_id=%s",
        user_id,
        row[0],
        class_id or "general",
        payload.document_id or "none",
    )
    cols = ["id", "class_id", "document_id", "title", "created_at", "updated_at"]
    return dict(zip(cols, row))


@router.get("/sessions")
async def list_sessions(
    class_id: Optional[int] = Query(default=None),
    document_id: Optional[str] = Query(default=None),
    user_id: str = Depends(get_request_user_uid),
):
    await _ensure_chat_schema()
    if class_id is not None:
        await _ensure_class_owner(class_id, user_id)
    if document_id:
        owner_class_id = await _ensure_file_owner(document_id, user_id, class_id)
        class_id = class_id or owner_class_id
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT id::text, class_id, document_id::text, title, created_at, updated_at
            FROM chat_sessions
            WHERE user_id=%s
              AND (%s::int IS NULL OR class_id=%s::int)
              AND (%s::uuid IS NULL OR document_id=%s::uuid)
            ORDER BY updated_at DESC
            """,
            (user_id, class_id, class_id, document_id, document_id),
        )
        rows = await cur.fetchall()
    log.info(
        "[CHAT_API] list chats user_id=%s class_id=%s document_id=%s count=%d",
        user_id,
        class_id,
        document_id or "none",
        len(rows),
    )
    cols = ["id", "class_id", "document_id", "title", "created_at", "updated_at"]
    return [dict(zip(cols, r)) for r in rows]


@alias_router.get("")
async def list_sessions_alias(
    class_id: Optional[int] = Query(default=None, alias="classId"),
    document_id: Optional[str] = Query(default=None, alias="documentId"),
    user_id: str = Depends(get_request_user_uid),
):
    return await list_sessions(class_id=class_id, document_id=document_id, user_id=user_id)


@alias_router.post("")
async def create_session_alias(payload: ChatSessionCreate, user_id: str = Depends(get_request_user_uid)):
    return await create_session(payload=payload, user_id=user_id)


@router.patch("/sessions/{session_id}")
async def update_session(
    session_id: str,
    payload: ChatSessionUpdate,
    user_id: str = Depends(get_request_user_uid),
):
    if not (payload.title and payload.title.strip()):
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    title = payload.title.strip()
    await _ensure_chat_schema()
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE chat_sessions
            SET title=%s, updated_at=now()
            WHERE id=%s AND user_id=%s
            RETURNING id::text, class_id, document_id::text, title, created_at, updated_at
            """,
            (title, session_id, user_id),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        await conn.commit()
    cols = ["id", "class_id", "document_id", "title", "created_at", "updated_at"]
    return dict(zip(cols, row))


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    class_id: Optional[int] = Query(default=None, alias="classId"),
    user_id: str = Depends(get_request_user_uid),
):
    await _ensure_chat_schema()
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT id::text, class_id, document_id::text, title, created_at, updated_at
            FROM chat_sessions
            WHERE id=%s AND user_id=%s AND (%s::int IS NULL OR class_id=%s::int)
            """,
            (session_id, user_id, class_id, class_id),
        )
        sess = await cur.fetchone()
        if not sess:
            raise HTTPException(status_code=404, detail="Session not found")
        if _schema_checked:
            await cur.execute(
                """
                SELECT id::text, role, content, citations, selected_text, page_number, bounding_box, file_id::text, file_scope, image_attachment, created_at
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
    log.info(
        "[CHAT_API] get messages session_id=%s user_id=%s count=%d",
        session_id,
        user_id,
        len(msgs),
    )
    sess_cols = ["id", "class_id", "document_id", "title", "created_at", "updated_at"]
    msg_cols = (
        [
            "id",
            "role",
            "content",
            "citations",
            "selected_text",
            "page_number",
            "bounding_box",
            "file_id",
            "file_scope",
            "image_attachment",
            "created_at",
        ]
        if _schema_checked
        else ["id", "role", "content", "citations", "created_at"]
    )
    return {
        "session": dict(zip(sess_cols, sess)),
        "messages": [dict(zip(msg_cols, m)) for m in msgs],
    }


@router.get("/sessions/{session_id}/messages")
async def list_session_messages(
    session_id: str,
    class_id: Optional[int] = Query(default=None, alias="classId"),
    user_id: str = Depends(get_request_user_uid),
):
    await _ensure_chat_schema()
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT 1
            FROM chat_sessions
            WHERE id=%s AND user_id=%s AND (%s::int IS NULL OR class_id=%s::int)
            """,
            (session_id, user_id, class_id, class_id),
        )
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")
        if _schema_checked:
            await cur.execute(
                """
                SELECT id::text, role, content, citations, selected_text, page_number, bounding_box, file_id::text, file_scope, image_attachment, created_at
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
    log.info("[CHAT_API] get messages session_id=%s count=%d", session_id, len(msgs))
    msg_cols = (
        [
            "id",
            "role",
            "content",
            "citations",
            "selected_text",
            "page_number",
            "bounding_box",
            "file_id",
            "file_scope",
            "image_attachment",
            "created_at",
        ]
        if _schema_checked
        else ["id", "role", "content", "citations", "created_at"]
    )
    return [dict(zip(msg_cols, m)) for m in msgs]


@alias_router.get("/{session_id}/messages")
async def list_session_messages_alias(
    session_id: str,
    class_id: Optional[int] = Query(default=None, alias="classId"),
    user_id: str = Depends(get_request_user_uid),
):
    return await list_session_messages(session_id=session_id, class_id=class_id, user_id=user_id)


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
    bounding_box_json = Json(payload.bounding_box) if payload.bounding_box is not None else None
    async with db_conn() as (conn, cur):
        await cur.execute(
            "SELECT class_id, document_id::text FROM chat_sessions WHERE id=%s AND user_id=%s",
            (session_id, user_id),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        class_id = row[0]
        document_id = row[1]
        if payload.class_id is not None and class_id is not None and int(payload.class_id) != int(class_id):
            raise HTTPException(status_code=404, detail="Session not found in class")
        log.info(
            "[CHAT_API] save user message session_id=%s user_id=%s class_id=%s document_id=%s",
            session_id,
            user_id,
            class_id,
            document_id or "none",
        )
        if payload.file_id:
            if class_id is None:
                raise HTTPException(status_code=400, detail="File-scoped messages require a class")
            await cur.execute(
                "SELECT 1 FROM files WHERE id=%s AND class_id=%s",
                (payload.file_id, class_id),
            )
            if not await cur.fetchone():
                raise HTTPException(status_code=404, detail="File not found in class")
        if payload.document_id:
            owner_class_id = await _ensure_file_owner(payload.document_id, user_id, class_id)
            if class_id is None:
                class_id = owner_class_id
                await cur.execute(
                    "UPDATE chat_sessions SET class_id=%s, document_id=%s WHERE id=%s",
                    (class_id, payload.document_id, session_id),
                )
        if document_id and payload.file_id and payload.file_id != document_id:
            raise HTTPException(status_code=404, detail="File not found in session scope")
        if document_id and payload.document_id and payload.document_id != document_id:
            raise HTTPException(status_code=404, detail="File not found in session scope")
        if _schema_checked:
            await cur.execute(
                """
                INSERT INTO chat_messages (session_id, role, content, citations, selected_text, page_number, bounding_box, file_id, file_scope, image_attachment)
                VALUES (%s, 'user', %s, NULL, %s, %s, %s, %s, %s, %s)
                """,
                (
                    session_id,
                    payload.user_content,
                    payload.selected_text,
                    payload.page_number,
                    bounding_box_json,
                    payload.file_id,
                    file_scope_json,
                    image_attachment_json,
                ),
            )
            if payload.assistant_content is not None:
                await cur.execute(
                    """
                    INSERT INTO chat_messages (session_id, role, content, citations, selected_text, page_number, bounding_box, file_id, file_scope, image_attachment)
                    VALUES (%s, 'assistant', %s, %s, NULL, NULL, NULL, NULL, %s, NULL)
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
            if payload.assistant_content is not None:
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
                SELECT id::text, role, content, citations, selected_text, page_number, bounding_box, file_id::text, file_scope, image_attachment, created_at
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
    log.info(
        "[CHAT_API] save assistant response session_id=%s user_id=%s saved=%d total=%d",
        session_id,
        user_id,
        2 if payload.assistant_content is not None else 1,
        len(msgs),
    )
    msg_cols = (
        [
            "id",
            "role",
            "content",
            "citations",
            "selected_text",
            "page_number",
            "bounding_box",
            "file_id",
            "file_scope",
            "image_attachment",
            "created_at",
        ]
        if _schema_checked
        else ["id", "role", "content", "citations", "created_at"]
    )
    return {"ok": True, "messages": [dict(zip(msg_cols, m)) for m in msgs]}


@alias_router.post("/{session_id}/messages")
async def add_messages_alias(
    session_id: str,
    payload: ChatMessageCreate,
    user_id: str = Depends(get_request_user_uid),
):
    return await add_messages(session_id=session_id, payload=payload, user_id=user_id)
