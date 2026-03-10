import os

os.environ.setdefault("DATABASE_URL", "postgresql://notescape:notescape_pass@localhost/notescape")
os.environ.setdefault("CORS_ORIGINS", "http://localhost")
os.environ.setdefault("UPLOAD_ROOT", ".")
os.environ.setdefault("S3_ENDPOINT_URL", "https://example.com")
os.environ.setdefault("S3_ACCESS_KEY", "fake")
os.environ.setdefault("S3_SECRET_KEY", "fake")
os.environ.setdefault("S3_BUCKET", "fake")
os.environ.setdefault("CHAT_PROVIDER", "fake")
os.environ.setdefault("CHAT_MODEL", "fake")

from app.routers.flashcards import _is_allowed_audio, _voice_rating_to_sm2


def test_voice_rating_to_sm2_mapping():
    assert _voice_rating_to_sm2(1) == "again"
    assert _voice_rating_to_sm2(2) == "hard"
    assert _voice_rating_to_sm2(3) == "good"
    assert _voice_rating_to_sm2(4) == "easy"
    assert _voice_rating_to_sm2(5) == "easy"


def test_allowed_audio_validation():
    assert _is_allowed_audio("audio/webm", "answer.webm")
    assert _is_allowed_audio("application/octet-stream", "answer.m4a")
    assert not _is_allowed_audio("text/plain", "notes.txt")
