# backend/app/routes/subscribe.py
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
import smtplib
from email.mime.text import MIMEText

router = APIRouter()

class SubscribeRequest(BaseModel):
    email: str

@router.post("/api/subscribe")
async def subscribe_user(data: SubscribeRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(send_email, data.email)
    return {"message": "Subscribed successfully"}

def send_email(subscriber_email: str):
    sender = "notescapeai@gmail.com"
    password = "your-app-password"  # Use Gmail App Password
    receiver = "notescapeai@gmail.com"

    msg = MIMEText(f"New subscriber: {subscriber_email}")
    msg["Subject"] = "New Notescape Subscriber"
    msg["From"] = sender
    msg["To"] = receiver

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(sender, password)
        smtp.send_message(msg)
