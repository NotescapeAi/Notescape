from datetime import datetime
from typing import Optional, Dict, Any
import asyncio
import uuid
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from firebase_admin import auth as fb_auth

from app.core.db import db_conn
from app.core.settings import settings
from app.core.storage import presign_get_url, put_object, sanitize_filename
from app.dependencies import get_request_user_uid

router = APIRouter(prefix="/api", tags=["profile"])

UPLOAD_ROOT = Path(settings.upload_root)

_schema_ready = False
_schema_lock = asyncio.Lock()


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    avatar_url: Optional[str] = None
    secondary_email: Optional[str] = None


class SettingsUpdate(BaseModel):
    dark_mode: Optional[bool] = None

class PreferencesUpdate(BaseModel):
    theme: str = Field(min_length=4, max_length=6)

def _map_provider(provider_id: str) -> str:
    if "github" in provider_id:
        return "github"
    return "google"



async def _ensure_user_schema():
    global _schema_ready
    if _schema_ready:
        return
    async with _schema_lock:
        if _schema_ready:
            return
        async with db_conn() as (conn, cur):
            await cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                  email TEXT UNIQUE NOT NULL,
                  full_name TEXT,
                  avatar_url TEXT,
                  firebase_uid TEXT NOT NULL,
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
            await cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid TEXT NOT NULL DEFAULT ''")
            await cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'google'")
            await cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id TEXT NOT NULL DEFAULT ''")
            await cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_firebase_uid_idx ON users (firebase_uid)")
            await cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN NOT NULL DEFAULT FALSE")
            await cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference TEXT NOT NULL DEFAULT 'system'")
            await cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()")
            await cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_avatar_url TEXT")
            await cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_avatar_url TEXT")
            await cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS secondary_email TEXT")
            await conn.commit()
        _schema_ready = True


async def _upsert_user_from_firebase(request: Request, user_id: str) -> Dict[str, Any]:
    await _ensure_user_schema()
    
    email = None
    full_name = None
    avatar_url = None
    provider = "google"
    provider_id = ""
    display_name = None
    firebase_uid = user_id
    
    # 1. Handle dev user
    if user_id == "dev-user":
        email = "dev-user@example.com"
        provider = "dev"
        provider_id = "dev-user"
        full_name = "Dev User"
        display_name = full_name
        avatar_url = None
        
    # 2. Try to get from token (fastest, works without service account)
    elif hasattr(request.state, "user") and request.state.user and request.state.user.get("uid") == user_id:
        user_claims = request.state.user
        email = user_claims.get("email") or f"{user_id}@example.com"
        full_name = user_claims.get("name") or ""
        avatar_url = user_claims.get("picture")
        
        fb_info = user_claims.get("firebase", {})
        sign_in_provider = fb_info.get("sign_in_provider", "google.com")
        provider = _map_provider(sign_in_provider)
        
        identities = fb_info.get("identities", {})
        if sign_in_provider in identities and identities[sign_in_provider]:
             provider_id = identities[sign_in_provider][0]
        else:
             provider_id = user_id
             
        display_name = full_name or email

    # 3. Fallback to Firebase Admin SDK
    else:
        try:
            user = fb_auth.get_user(user_id)
            email = user.email or f"{user_id}@example.com"
            full_name = user.display_name or ""
            avatar_url = user.photo_url or None
            
            p_data = user.provider_data[0] if user.provider_data else None
            provider_id = p_data.provider_id if p_data else "google.com"
            provider = _map_provider(provider_id)
            
            display_name = user.display_name or full_name or email
        except Exception:
            # 4. If fetch fails (e.g. no service account), check if user exists in DB
            pass

    # If we still don't have email, try to fetch existing user
    if not email:
         async with db_conn() as (conn, cur):
             await cur.execute("SELECT * FROM users WHERE firebase_uid=%s", (user_id,))
             row = await cur.fetchone()
             if row:
                  # Found existing user! Return it directly without update
                  cols = [desc[0] for desc in cur.description]
                  data = dict(zip(cols, row))
                  # Resolve avatar_url
                  if data.get("avatar_url"):
                      val = data["avatar_url"]
                      if val.startswith("avatars/"):
                           if settings.storage_backend == "s3":
                               try:
                                   data["avatar_url"] = presign_get_url(val, expires_seconds=86400)
                               except Exception:
                                   pass
                           else:
                               data["avatar_url"] = f"/api/profile/{val}"
                  return data
             else:
                  # Not found in DB and failed to fetch from Firebase
                  raise HTTPException(status_code=401, detail="User not found or unable to verify")

    # Check if user exists by email to prevent duplicate key error
    async with db_conn() as (conn, cur):
        # First check by firebase_uid
        await cur.execute("SELECT id FROM users WHERE firebase_uid=%s", (firebase_uid,))
        row = await cur.fetchone()
        
        if not row and email:
            # If not found by uid, check by email
            await cur.execute("SELECT id, firebase_uid FROM users WHERE email=%s", (email,))
            existing_by_email = await cur.fetchone()
            
            if existing_by_email:
                # User exists with this email but different UID. 
                # We should update the UID to match the current login (account linking/migration)
                # or just use this user.
                # Let's update the firebase_uid to the current one so future logins work fast.
                await cur.execute(
                    "UPDATE users SET firebase_uid=%s, provider=%s, provider_id=%s, updated_at=now() WHERE id=%s",
                    (firebase_uid, provider, provider_id, existing_by_email[0])
                )
                await conn.commit()
                # Now we can proceed to the upsert/update block below, which will catch it via ON CONFLICT (firebase_uid)
                # because we just set the firebase_uid.

    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            INSERT INTO users (email, full_name, avatar_url, provider_avatar_url, firebase_uid, provider, provider_id, display_name)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (firebase_uid)
            DO UPDATE SET
              email=EXCLUDED.email,
              full_name=EXCLUDED.full_name,
              provider_avatar_url=EXCLUDED.provider_avatar_url,
              avatar_url=COALESCE(users.custom_avatar_url, EXCLUDED.provider_avatar_url),
              display_name=COALESCE(NULLIF(users.display_name, ''), EXCLUDED.display_name),
              provider=EXCLUDED.provider,
              provider_id=EXCLUDED.provider_id,
              updated_at=now()
            RETURNING id::text, email, full_name, avatar_url, firebase_uid, provider, provider_id, display_name, dark_mode, theme_preference, created_at, updated_at, custom_avatar_url, provider_avatar_url, secondary_email
            """,
            (
                email,
                full_name,
                avatar_url,  # initial avatar_url (same as provider_url)
                avatar_url,  # provider_avatar_url
                firebase_uid,
                provider,
                provider_id,
                display_name,
            ),
        )
        row = await cur.fetchone()
        await conn.commit()
    cols = [
        "id",
        "email",
        "full_name",
        "avatar_url",
        "firebase_uid",
        "provider",
        "provider_id",
        "display_name",
        "dark_mode",
        "theme_preference",
        "created_at",
        "updated_at",
        "custom_avatar_url",
        "provider_avatar_url",
        "secondary_email",
    ]
    data = dict(zip(cols, row))
    
    # Resolve avatar_url
    if data.get("avatar_url"):
        # If it starts with avatars/, it's a relative path (local or S3 key)
        # If it starts with http, it's likely a provider URL
        val = data["avatar_url"]
        if val.startswith("avatars/"):
             # If S3, presign it
             if settings.storage_backend == "s3":
                 try:
                     data["avatar_url"] = presign_get_url(val, expires_seconds=86400)
                 except Exception:
                     pass
             else:
                 # If local, serve via API
                 # Assuming we have a route like /api/profile/avatars/{path}
                 # We'll construct a URL that points to our backend
                 # For now, let's just return the relative path and handle it in frontend or add a route
                 data["avatar_url"] = f"/api/profile/{val}"
                 
    return data


@router.get("/profile")
async def get_profile(request: Request, user_id: str = Depends(get_request_user_uid)):
    data = await _upsert_user_from_firebase(request, user_id)
    display = data.get("display_name") or data.get("full_name") or data.get("email")
    data["display_name"] = display
    return data


@router.patch("/profile")
async def update_profile(request: Request, payload: ProfileUpdate, user_id: str = Depends(get_request_user_uid)):
    # We now allow all users to update their profile (display name, avatar)
    data = await _upsert_user_from_firebase(request, user_id)
    updates = {}
    provided_fields = payload.model_fields_set

    if "display_name" in provided_fields:
        if payload.display_name is None:
            raise HTTPException(status_code=400, detail="Display name cannot be empty.")
        trimmed_display_name = payload.display_name.strip()
        if not trimmed_display_name:
            raise HTTPException(status_code=400, detail="Display name cannot be empty.")
        if len(trimmed_display_name) > 120:
            raise HTTPException(status_code=400, detail="Display name must be 120 characters or fewer.")
        updates["display_name"] = trimmed_display_name
    
    if "avatar_url" in provided_fields:
        val = payload.avatar_url.strip() if isinstance(payload.avatar_url, str) else None
        val = val or None
        if val:
            # Setting a custom avatar
            updates["custom_avatar_url"] = val
            updates["avatar_url"] = val
        else:
            # Clearing custom avatar
            updates["custom_avatar_url"] = None
            # Revert to provider avatar
            updates["avatar_url"] = data.get("provider_avatar_url")

    if "secondary_email" in provided_fields:
        if payload.secondary_email is None:
            updates["secondary_email"] = None
        else:
            updates["secondary_email"] = payload.secondary_email.strip() or None

    if updates:
        async with db_conn() as (conn, cur):
            set_clauses = []
            values = []
            
            if "display_name" in updates:
                set_clauses.append("display_name=%s")
                values.append(updates["display_name"])
            
            if "secondary_email" in updates:
                set_clauses.append("secondary_email=%s")
                values.append(updates["secondary_email"])
            
            if "custom_avatar_url" in updates:
                set_clauses.append("custom_avatar_url=%s")
                values.append(updates["custom_avatar_url"])
                
            if "avatar_url" in updates:
                set_clauses.append("avatar_url=%s")
                values.append(updates["avatar_url"])
                
            set_clauses.append("updated_at=now()")
            values.append(data["firebase_uid"])
            
            query = f"""
                UPDATE users
                SET {", ".join(set_clauses)}
                WHERE firebase_uid=%s
                RETURNING id::text, email, full_name, avatar_url, firebase_uid, provider, provider_id, display_name, dark_mode, theme_preference, created_at, updated_at, custom_avatar_url, provider_avatar_url, secondary_email
            """
            
            await cur.execute(query, tuple(values))
            row = await cur.fetchone()
            await conn.commit()
            
        cols = [
            "id",
            "email",
            "full_name",
            "avatar_url",
            "firebase_uid",
            "provider",
            "provider_id",
            "display_name",
            "dark_mode",
            "theme_preference",
            "created_at",
            "updated_at",
            "custom_avatar_url",
            "provider_avatar_url",
            "secondary_email",
        ]
        data = dict(zip(cols, row))
        
        # Resolve avatar_url
        if data.get("avatar_url"):
            val = data["avatar_url"]
            if val.startswith("avatars/"):
                if settings.storage_backend == "s3":
                    try:
                        data["avatar_url"] = presign_get_url(val, expires_seconds=86400)
                    except Exception:
                        pass
                else:
                    data["avatar_url"] = f"/api/profile/{val}"
        return data
        
    return data


@router.get("/settings")
async def get_settings(request: Request, user_id: str = Depends(get_request_user_uid)):
    data = await _upsert_user_from_firebase(request, user_id)
    return {"dark_mode": bool(data.get("dark_mode"))}


@router.patch("/settings")
async def update_settings(request: Request, payload: SettingsUpdate, user_id: str = Depends(get_request_user_uid)):
    data = await _upsert_user_from_firebase(request, user_id)
    if payload.dark_mode is None:
        return {"dark_mode": bool(data.get("dark_mode"))}
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE users
            SET dark_mode=%s, updated_at=now()
        WHERE firebase_uid=%s
        RETURNING dark_mode
        """,
            (payload.dark_mode, data["firebase_uid"]),
        )
        row = await cur.fetchone()
        await conn.commit()
    return {"dark_mode": bool(row[0])}


@router.get("/preferences")
async def get_preferences(request: Request, user_id: str = Depends(get_request_user_uid)):
    data = await _upsert_user_from_firebase(request, user_id)
    theme = data.get("theme_preference") or "system"
    return {"theme": theme}


@router.patch("/preferences")
async def update_preferences(request: Request, payload: PreferencesUpdate, user_id: str = Depends(get_request_user_uid)):
    theme = payload.theme.lower().strip()
    if theme not in {"light", "dark", "system"}:
        raise HTTPException(status_code=400, detail="Invalid theme")
    data = await _upsert_user_from_firebase(request, user_id)
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE users
            SET theme_preference=%s, updated_at=now()
        WHERE firebase_uid=%s
        RETURNING theme_preference
        """,
            (theme, data["firebase_uid"]),
        )
        row = await cur.fetchone()
        await conn.commit()
    return {"theme": row[0]}


@router.post("/settings/reset-flashcards")
async def reset_flashcards(user_id: str = Depends(get_request_user_uid)):
    await _ensure_user_schema()
    if settings.safe_mode:
        raise HTTPException(status_code=403, detail="Flashcard reset disabled in safe mode.")
    async with db_conn() as (conn, cur):
        await cur.execute("DELETE FROM sr_card_state WHERE user_id=%s", (user_id,))
        await cur.execute("DELETE FROM card_review_state WHERE user_id=%s", (user_id,))
        await cur.execute("DELETE FROM study_events WHERE user_id=%s", (user_id,))
        await cur.execute("DELETE FROM study_event_rollups_daily WHERE user_id=%s", (user_id,))
        await cur.execute("DELETE FROM study_sessions WHERE user_id=%s", (user_id,))
        await cur.execute("DELETE FROM flashcard_jobs WHERE user_id=%s", (user_id,))
        await cur.execute("DELETE FROM card_review_state WHERE user_id=%s", (user_id,))
        await cur.execute("DELETE FROM study_events WHERE user_id=%s", (user_id,))
        await cur.execute("DELETE FROM study_event_rollups_daily WHERE user_id=%s", (user_id,))
        await conn.commit()
    return {"ok": True}


@router.post("/settings/clear-chat")
async def clear_chat(user_id: str = Depends(get_request_user_uid)):
    await _ensure_user_schema()
    if settings.safe_mode:
        raise HTTPException(status_code=403, detail="Chat clearing disabled in safe mode.")
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
    if settings.safe_mode:
        raise HTTPException(status_code=403, detail="Embedding clear disabled in safe mode.")
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
async def delete_account(request: Request, user_id: str = Depends(get_request_user_uid)):
    data = await _upsert_user_from_firebase(request, user_id)
    if settings.safe_mode:
        raise HTTPException(status_code=403, detail="Account delete disabled in safe mode.")
    async with db_conn() as (conn, cur):
        await cur.execute("DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE user_id=%s)", (user_id,))
        await cur.execute("DELETE FROM chat_sessions WHERE user_id=%s", (user_id,))
        await cur.execute("DELETE FROM sr_card_state WHERE user_id=%s", (user_id,))
        await cur.execute("DELETE FROM card_review_state WHERE user_id=%s", (user_id,))
        await cur.execute("DELETE FROM study_events WHERE user_id=%s", (user_id,))
        await cur.execute("DELETE FROM study_event_rollups_daily WHERE user_id=%s", (user_id,))
        await cur.execute("DELETE FROM study_sessions WHERE user_id=%s", (user_id,))
        await cur.execute("DELETE FROM flashcard_jobs WHERE user_id=%s", (user_id,))
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
            "DELETE FROM users WHERE firebase_uid=%s",
            (data["firebase_uid"],),
        )
        await conn.commit()
    return {"ok": True, "deleted_at": datetime.utcnow().isoformat() + "Z"}


@router.post("/profile/avatar")
async def upload_avatar(request: Request, file: UploadFile = File(...), user_id: str = Depends(get_request_user_uid)):
    data = await _upsert_user_from_firebase(request, user_id)
    
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
        
    # Generate filename
    ext = Path(file.filename).suffix
    if not ext:
        ext = ".jpg"
    
    filename = f"avatar_{uuid.uuid4().hex[:8]}{ext}"
    key = f"avatars/{user_id}/{filename}"
    
    try:
        if settings.storage_backend == "s3":
            # put_object is blocking, run in thread
            stored = await asyncio.to_thread(put_object, file.file, key, file.content_type)
            storage_key = stored.key
        else:
            # Local storage
            local_path = UPLOAD_ROOT / key
            local_path.parent.mkdir(parents=True, exist_ok=True)
            file.file.seek(0)
            with open(local_path, "wb") as out:
                shutil.copyfileobj(file.file, out)
            storage_key = key
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload avatar: {e}")
        
    # Update profile
    async with db_conn() as (conn, cur):
        await cur.execute(
            """
            UPDATE users
            SET custom_avatar_url=%s, avatar_url=%s, updated_at=now()
            WHERE firebase_uid=%s
            RETURNING id::text, email, full_name, avatar_url, firebase_uid, provider, provider_id, display_name, dark_mode, theme_preference, created_at, updated_at, custom_avatar_url, provider_avatar_url, secondary_email
            """,
            (storage_key, storage_key, data["firebase_uid"])
        )
        row = await cur.fetchone()
        await conn.commit()
        
    cols = [
        "id",
        "email",
        "full_name",
        "avatar_url",
        "firebase_uid",
        "provider",
        "provider_id",
        "display_name",
        "dark_mode",
        "theme_preference",
        "created_at",
        "updated_at",
        "custom_avatar_url",
        "provider_avatar_url",
        "secondary_email",
    ]
    new_data = dict(zip(cols, row))
    
    # Resolve
    if new_data.get("avatar_url"):
         val = new_data["avatar_url"]
         if val.startswith("avatars/"):
             if settings.storage_backend == "s3":
                 try:
                     new_data["avatar_url"] = presign_get_url(val, expires_seconds=86400)
                 except Exception:
                     pass
             else:
                 new_data["avatar_url"] = f"/api/profile/{val}"
             
    return new_data

@router.get("/profile/avatars/{user_id}/{filename}")
async def get_local_avatar(user_id: str, filename: str):
    # Verify path safety
    safe_filename = sanitize_filename(filename)
    # We could also verify user_id matches request user or if avatars are public. 
    # Avatars are generally public.
    
    path = UPLOAD_ROOT / "avatars" / user_id / safe_filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Avatar not found")
        
    return FileResponse(path)
