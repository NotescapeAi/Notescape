import base64
import re
import subprocess
import tempfile
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_request_user_uid

router = APIRouter(prefix="/api/chat", tags=["chat"])


class OcrRequest(BaseModel):
    data_url: str


def _decode_data_url(data_url: str) -> bytes:
    if not data_url:
        raise ValueError("missing image data")
    if data_url.startswith("data:"):
        header, b64 = data_url.split(",", 1)
        if not re.match(r"data:.*;base64", header):
            raise ValueError("unsupported data URL")
        return base64.b64decode(b64)
    return base64.b64decode(data_url)


@router.post("/ocr")
async def ocr_snippet(payload: OcrRequest, user_id: str = Depends(get_request_user_uid)):
    try:
        img_bytes = _decode_data_url(payload.data_url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid image data") from exc

    try:
        with tempfile.NamedTemporaryFile(suffix=".png") as tmp:
            tmp.write(img_bytes)
            tmp.flush()
            text = subprocess.check_output(
                ["tesseract", tmp.name, "stdout"],
                text=True,
                encoding="utf-8",
                errors="ignore",
            )
        return {"text": (text or "").strip()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail="OCR failed") from exc
