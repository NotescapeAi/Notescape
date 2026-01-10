from datetime import datetime
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from firebase_admin import auth as fb_auth

from app.core.db import db_conn
from app.dependencies import get_request_user_uid

router = APIRouter(prefix="/api", tags=["profile"])
_schema_checked = False


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    avatar_url: Optional[str] = None


class SettingsUpdate(BaseModel):
    dark_mode: Optional[bool] = None


def _map_provider(provider_id: str) -> str:
    if provider_id == "google.com":
        return "google"
    if provider_id == "github.com":
        return "github"
    return "google"


async def _ensure_user_schema():
    global _schema_checked
    if _schema_checked:
        return
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              email TEXT UNIQUE NOT NULL,
              full_name TEXT,
              avatar_url TEXT,
              provider TEXT NOT NULL,
              provider_id TEXT NOT NULL,
              display_name TEXT,
              dark_mode BOOLEAN NOT NULL DEFAULT FALSE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await cur.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS users_provider_idx ON users (provider, provider_id)"
        )
        await cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT")
        await cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT")
        await cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT")
        await cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'google'")
        await cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id TEXT NOT NULL DEFAULT ''")
        await cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN NOT NULL DEFAULT FALSE")
        await cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()")
        await conn.commit()
    _schema_checked = True


async def _upsert_user_from_firebase(user_id: str) -> Dict[str, Any]:
    await _ensure_user_schema()
    if user_id == "dev-user":
        email = "dev-user@example.com"
        provider = "google"
        provider_uid = "dev-user"
        full_name = "Dev User"
        avatar_url = None
    else:
        try:
            user = fb_auth.get_user(user_id)
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid user")
        email = user.email or f"{user_id}@example.com"
        full_name = user.display_name or ""
        avatar_url = user.photo_url or None
        provider_id = user.provider_data[0].provider_id if user.provider_data else "google.com"
        provider = _map_provider(provider_id)
        provider_uid = user.provider_data[0].uid if user.provider_data else user_id

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            INSERT INTO users (email, full_name, avatar_url, provider, provider_id, display_name)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (provider, provider_id)
            DO UPDATE SET
              email=EXCLUDED.email,
              full_name=EXCLUDED.full_name,
              avatar_url=EXCLUDED.avatar_url,
              updated_at=now()
            RETURNING id::text, email, full_name, avatar_url, provider, provider_id, display_name, dark_mode, created_at, updated_at
            """,
            (
                email,
                full_name,
                avatar_url,
                provider,
                provider_uid,
                full_name or email,
            ),
        )
        row = await cur.fetchone()
        await conn.commit()
    cols = [
        "id",
        "email",
        "full_name",
        "avatar_url",
        "provider",
        "provider_id",
        "display_name",
        "dark_mode",
        "created_at",
        "updated_at",
    ]
    return dict(zip(cols, row))


@router.get("/profile")
async def get_profile(user_id: str = Depends(get_request_user_uid)):
    data = await _upsert_user_from_firebase(user_id)
    display = data.get("display_name") or data.get("full_name") or data.get("email")
    data["display_name"] = display
    return data


@router.patch("/profile")
async def update_profile(payload: ProfileUpdate, user_id: str = Depends(get_request_user_uid)):
    data = await _upsert_user_from_firebase(user_id)
    updates = {}
    if payload.display_name is not None:
        updates["display_name"] = payload.display_name.strip()
    if payload.avatar_url is not None:
        updates["avatar_url"] = payload.avatar_url.strip() or None
    if updates:
        async with db_conn() as (conn, cur):
            await cur.execute(
                """
                UPDATE users
                SET display_name=COALESCE(%s, display_name),
                    avatar_url=COALESCE(%s, avatar_url),
                    updated_at=now()
                WHERE provider=%s AND provider_id=%s
                RETURNING id::text, email, full_name, avatar_url, provider, provider_id, display_name, dark_mode, created_at, updated_at
                """,
                (
                    updates.get("display_name"),
                    updates.get("avatar_url"),
                    data["provider"],
                    data["provider_id"],
                ),
            )
            row = await cur.fetchone()
            await conn.commit()
        cols = [
            "id",
            "email",
            "full_name",
            "avatar_url",
            "provider",
            "provider_id",
            "display_name",
            "dark_mode",
            "created_at",
            "updated_at",
        ]
        return dict(zip(cols, row))
    return data


@router.get("/settings")
async def get_settings(user_id: str = Depends(get_request_user_uid)):
    data = await _upsert_user_from_firebase(user_id)
    return {"dark_mode": bool(data.get("dark_mode"))}


@router.patch("/settings")
async def update_settings(payload: SettingsUpdate, user_id: str = Depends(get_request_user_uid)):
    data = await _upsert_user_from_firebase(user_id)
    if payload.dark_mode is None:
        return {"dark_mode": bool(data.get("dark_mode"))}
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE users
            SET dark_mode=%s, updated_at=now()
            WHERE provider=%s AND provider_id=%s
            RETURNING dark_mode
            """,
            (payload.dark_mode, data["provider"], data["provider_id"]),
        )
        row = await cur.fetchone()
        await conn.commit()
    return {"dark_mode": bool(row[0])}


@router.post("/settings/reset-flashcards")
async def reset_flashcards(user_id: str = Depends(get_request_user_uid)):
    await _ensure_user_schema()
    async with db_conn() as (conn, cur):
        await cur.execute("DELETE FROM sr_card_state WHERE user_id=%s", (user_id,))
        await conn.commit()
    return {"ok": True}


@router.post("/settings/clear-chat")
async def clear_chat(user_id: str = Depends(get_request_user_uid)):
    await _ensure_user_schema()
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            DELETE FROM chat_messages
            WHERE session_id IN (SELECT id FROM chat_sessions WHERE user_id=%s)
            """,
            (user_id,),
        )
        await conn.commit()
    return {"ok": True}


@router.post("/settings/clear-embeddings")
async def clear_embeddings(user_id: str = Depends(get_request_user_uid)):
    await _ensure_user_schema()
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE file_chunks
            SET chunk_vector=NULL
            WHERE file_id IN (
              SELECT f.id
              FROM files f
              JOIN classes c ON c.id = f.class_id
              WHERE c.owner_uid=%s
            )
            """,
            (user_id,),
        )
        await conn.commit()
    return {"ok": True}


@router.delete("/account")
async def delete_account(user_id: str = Depends(get_request_user_uid)):
    data = await _upsert_user_from_firebase(user_id)
    async with db_conn() as (conn, cur):
        await cur.execute("DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE user_id=%s)", (user_id,))
        await cur.execute("DELETE FROM chat_sessions WHERE user_id=%s", (user_id,))
        await cur.execute("DELETE FROM sr_card_state WHERE user_id=%s", (user_id,))
        await cur.execute(
            """
            DELETE FROM flashcards
            WHERE class_id IN (SELECT id FROM classes WHERE owner_uid=%s)
            """,
            (user_id,),
        )
        await cur.execute(
            """
            DELETE FROM file_chunks
            WHERE file_id IN (
              SELECT f.id
              FROM files f
              JOIN classes c ON c.id = f.class_id
              WHERE c.owner_uid=%s
            )
            """,
            (user_id,),
        )
        await cur.execute(
            "DELETE FROM files WHERE class_id IN (SELECT id FROM classes WHERE owner_uid=%s)",
            (user_id,),
        )
        await cur.execute("DELETE FROM classes WHERE owner_uid=%s", (user_id,))
        await cur.execute(
            "DELETE FROM users WHERE provider=%s AND provider_id=%s",
            (data["provider"], data["provider_id"]),
        )
        await conn.commit()
    return {"ok": True, "deleted_at": datetime.utcnow().isoformat() + "Z"}
