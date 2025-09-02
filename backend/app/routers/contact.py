from fastapi import APIRouter
from pydantic import BaseModel, EmailStr

router = APIRouter(prefix="/api", tags=["contact"])

class ContactIn(BaseModel):
    name: str
    email: EmailStr
    message: str

@router.post("/contact")
async def contact(payload: ContactIn):
    # TODO: wire SMTP/EmailJS
    print("CONTACT FORM:", payload.model_dump())
    return {"ok": True}
