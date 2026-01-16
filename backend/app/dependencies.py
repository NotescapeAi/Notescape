# backend/app/dependencies.py
from fastapi import Depends, HTTPException, Header
from fastapi.security import OAuth2PasswordBearer
import firebase_admin
from firebase_admin import auth
from firebase_admin import credentials
import logging
import os

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

async def get_current_user_uid(token: str = Depends(oauth2_scheme)):
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token['uid']  # Real Firebase UID
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_request_user_uid(
    authorization: str | None = Header(default=None),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> str:
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
        try:
            decoded_token = auth.verify_id_token(token)
            return decoded_token["uid"]
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid token")
    if x_user_id:
        return x_user_id
    return "dev-user"
