# backend/app/dependencies.py
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
import firebase_admin
from firebase_admin import auth
from firebase_admin import credentials
# Initialize Firebase if not already done
if not firebase_admin._apps:
    cred = credentials.Certificate("/app/secrets/serviceAccountKey.json")

    firebase_admin.initialize_app(cred)

# This reads the "Authorization: Bearer <token>" header
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")  # tokenUrl is unused here, only required for OAuth2

async def get_current_user_uid(token: str = Depends(oauth2_scheme)):
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token['uid']  # Real Firebase UID
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
