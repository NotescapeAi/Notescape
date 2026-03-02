from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
import logging
from psycopg.types.json import Json
from pydantic import BaseModel, Field

from app.core.db import db_conn
from app.dependencies import get_request_user_uid
from app.core.chat_llm import chat_completion

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
    class_id: int
    document_id: Optional[str] = None
    title: Optional[str] = None


class ChatSessionUpdate(BaseModel):
    title: Optional[str] = None


class ChatMessageCreate(BaseModel):
    user_content: str
    assistant_content: str
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


@router.post("/sessions")
async def create_session(payload: ChatSessionCreate, user_id: str = Depends(get_request_user_uid)):
    await _ensure_chat_schema()
    await _ensure_class_owner(payload.class_id, user_id)
    if payload.document_id:
        async with db_conn() as (conn, cur):
            await cur.execute(
                "SELECT 1 FROM files WHERE id=%s AND class_id=%s",
                (payload.document_id, payload.class_id),
            )
            if not await cur.fetchone():
                raise HTTPException(status_code=404, detail="File not found in class")
    async with db_conn() as (conn, cur):
        title = (payload.title or "Chat session").strip() or "Chat session"
        await cur.execute(
            """
            INSERT INTO chat_sessions (user_id, class_id, document_id, title)
            VALUES (%s, %s, %s, %s)
            RETURNING id::text, class_id, document_id::text, title, created_at, updated_at
            """,
            (user_id, payload.class_id, payload.document_id, title),
        )
        row = await cur.fetchone()
        await conn.commit()
    log.info(
        "[chat] session created user_id=%s session_id=%s class_id=%s document_id=%s",
        user_id,
        row[0],
        payload.class_id,
        payload.document_id or "none",
    )
    cols = ["id", "class_id", "document_id", "title", "created_at", "updated_at"]
    return dict(zip(cols, row))


@router.get("/sessions")
async def list_sessions(
    class_id: int,
    document_id: Optional[str] = Query(default=None),
    include_all: bool = Query(default=False),
    user_id: str = Depends(get_request_user_uid),
):
    await _ensure_chat_schema()
    await _ensure_class_owner(class_id, user_id)
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT id::text, class_id, document_id::text, title, created_at, updated_at
            FROM chat_sessions
            WHERE user_id=%s AND class_id=%s AND (
                %s::boolean IS TRUE
                OR
                (%s::text IS NULL AND document_id IS NULL)
                OR
                (document_id = %s::uuid)
            )
            ORDER BY updated_at DESC
            """,
            (user_id, class_id, include_all, document_id, document_id),
        )
        rows = await cur.fetchall()
    log.info(
        "[chat] sessions listed user_id=%s class_id=%s return=%d",
        user_id,
        class_id,
        len(rows),
    )
    cols = ["id", "class_id", "document_id", "title", "created_at", "updated_at"]
    return [dict(zip(cols, r)) for r in rows]


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
async def get_session(session_id: str, user_id: str = Depends(get_request_user_uid)):
    await _ensure_chat_schema()
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            SELECT id::text, class_id, document_id::text, title, created_at, updated_at
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
        "[chat] list_messages session_id=%s user_id=%s count=%d",
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
    log.info(f"[chat] list_messages session_id={session_id} count={len(msgs)}")
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
        # Verify session exists and belongs to user
        await cur.execute(
            "SELECT class_id, document_id::text, title FROM chat_sessions WHERE id=%s AND user_id=%s",
            (session_id, user_id),
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")
        class_id = row[0]
        document_id = row[1]
        current_title = row[2]
        log.info(
            "[chat] add_messages session_id=%s user_id=%s class_id=%s document_id=%s payload_file_id=%s title=%s",
            session_id,
            user_id,
            class_id,
            document_id or "none",
            payload.file_id or "none",
            current_title,
        )

        # Verify file scope if provided
        if payload.file_id:
            await cur.execute(
                "SELECT 1 FROM files WHERE id=%s AND class_id=%s",
                (payload.file_id, class_id),
            )
            if not await cur.fetchone():
                log.error("[chat] file not found in class: file_id=%s class_id=%s", payload.file_id, class_id)
                # Allow it anyway for persistence robustness, just warn
                log.warning("[chat] file scope validation failed but proceeding (file not found in class)")
                # Prevent FK violation by unsetting the invalid file_id
                payload.file_id = None
        
        # Check if file_id matches the session document
        # Exception: if file_id matches the image_attachment's file_id, we allow it (it's an attachment, not a context switch)
        is_attachment = False
        if payload.image_attachment and payload.file_id:
             attachment_id = payload.image_attachment.get("file_id")
             if attachment_id and str(attachment_id) == str(payload.file_id):
                 is_attachment = True

        log.info("[chat] validation: document_id=%s payload_file_id=%s is_attachment=%s", document_id, payload.file_id, is_attachment)

        if document_id and payload.file_id and str(payload.file_id) != str(document_id) and not is_attachment:
            # Downgrade from error to warning to allow cross-document chatting in existing sessions
            log.warning("[chat] file mismatch: payload_file=%s session_doc=%s (allowing for robust persistence)", payload.file_id, document_id)

        
        try:
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
                await cur.execute(
                    """
                    INSERT INTO chat_messages (session_id, role, content, citations)
                    VALUES (%s, 'assistant', %s, %s)
                    """,
                    (session_id, payload.assistant_content, citations_json),
                )
        except Exception as e:
            log.error("[chat] save_message failed: %s", e, exc_info=True)
            raise e

        # Title auto-generation logic
        new_title = None
        if current_title == "Chat session" or current_title.startswith("Chat "):
            try:
                # Run title generation in threadpool to avoid blocking event loop
                system_prompt = "You are a helpful assistant. Generate a very concise (3-5 words) title for a chat session based on the user's first question. Do not use quotes. Just the title."
                user_prompt = f"User question: {payload.user_content}"
                
                # We need a sync wrapper because chat_completion is sync
                def _gen_title():
                    return chat_completion(system_prompt, user_prompt)

                generated = await run_in_threadpool(_gen_title)
                
                if generated and len(generated) < 100:
                    new_title = generated.strip().strip('"')
                    # Fallback if the LLM returns a generic error or "not found" message as the title
                    if "not found" in new_title.lower() or "error" in new_title.lower():
                        new_title = payload.user_content[:50].strip() or "Chat Session"
                    
                    await cur.execute("UPDATE chat_sessions SET title=%s WHERE id=%s", (new_title, session_id))
                    log.info("[chat] auto-generated title for session %s: %s", session_id, new_title)
            except Exception as e:
                log.warning("[chat] failed to auto-generate title: %s", e)

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
        "[chat] add_messages session_id=%s user_id=%s saved=2 total=%d",
        session_id,
        user_id,
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
    res = {"ok": True, "messages": [dict(zip(msg_cols, m)) for m in msgs]}
    if new_title:
        res["session_title"] = new_title
    return res
