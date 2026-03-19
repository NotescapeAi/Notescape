# backend/app/dependencies.py
from fastapi import Depends, HTTPException, Header, Query
from fastapi.security import OAuth2PasswordBearer
import firebase_admin
from firebase_admin import auth
from firebase_admin import credentials
import logging
import os
from typing import Any, Dict

SERVICE_ACCOUNT_PATH = os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY", "/app/secrets/serviceAccountKey.json")
log = logging.getLogger("uvicorn.error")

# Initialize Firebase if not already done
if not firebase_admin._apps:
    if os.path.exists(SERVICE_ACCOUNT_PATH):
        cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
        firebase_admin.initialize_app(cred)
    else:
        log.warning("Firebase service account not found at %s; auth is disabled in this process.", SERVICE_ACCOUNT_PATH)

# This reads the "Authorization: Bearer <token>" header
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")  # tokenUrl is unused here, only required for OAuth2

def _decode_verified_token(token: str) -> Dict[str, Any]:
    decoded_token = auth.verify_id_token(token)
    if not decoded_token.get("email_verified"):
        raise HTTPException(status_code=403, detail="Email not verified")
    return decoded_token


async def get_current_user_uid(token: str = Depends(oauth2_scheme)):
    try:
        decoded_token = _decode_verified_token(token)
        return decoded_token["uid"]  # Real Firebase UID
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_request_user_uid(
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    token: str | None = Query(default=None),
) -> str:
    # 1. Check Authorization header
    if authorization and authorization.lower().startswith("bearer "):
        # If Firebase is not initialized (no service account), we cannot verify the token.
        # Fallback to dev-user to allow local development without backend credentials.
        if not firebase_admin._apps:
            log.warning("Received Bearer token but Firebase Admin is not initialized. Using 'dev-user'.")
            return "dev-user"

        token_str = authorization.split(" ", 1)[1]
        try:
            decoded_token = _decode_verified_token(token_str)
            return decoded_token["uid"]
        except HTTPException:
            raise
        except Exception as e:
            log.error(f"Token verification failed: {e}")
            raise HTTPException(status_code=401, detail="Invalid token")

    # 2. Check query param (useful for SSE/EventSource which doesn't support headers)
    if token:
        if not firebase_admin._apps:
             return "dev-user"
        try:
            decoded_token = _decode_verified_token(token)
            return decoded_token["uid"]
        except Exception as e:
            log.error(f"Query token verification failed: {e}")
            # Don't raise immediately, check x_user_id or fallback
            pass

    # 3. Check X-User-Id header (for dev/testing)
    if x_user_id:
        return x_user_id
    
    return "dev-user"
