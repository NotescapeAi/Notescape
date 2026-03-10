import io
import os
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers, UploadFile
from starlette.requests import Request

os.environ.setdefault("DATABASE_URL", "postgresql://notescape:notescape_pass@localhost/notescape")
os.environ.setdefault("CORS_ORIGINS", "http://localhost")
os.environ.setdefault("UPLOAD_ROOT", ".")
os.environ.setdefault("S3_ENDPOINT_URL", "https://example.com")
os.environ.setdefault("S3_ACCESS_KEY", "fake")
os.environ.setdefault("S3_SECRET_KEY", "fake")
os.environ.setdefault("S3_BUCKET", "fake")
os.environ.setdefault("CHAT_PROVIDER", "fake")
os.environ.setdefault("CHAT_MODEL", "fake")

from app.routers import flashcards as flashcards_router
from app.services.transcription import TranscriptionError, TranscriptionUnavailableError


class FakeCursor:
    def __init__(self):
        self.executed = []
        self.fetchone_results = []

    async def execute(self, sql: str, params=None):
        self.executed.append((sql.strip(), params))

    async def fetchone(self):
        if not self.fetchone_results:
            return None
        return self.fetchone_results.pop(0)


class FakeConn:
    async def commit(self):
        return None


def make_db_conn(cursor: FakeCursor):
    @asynccontextmanager
    async def _ctx():
        yield FakeConn(), cursor

    return _ctx


def make_request() -> Request:
    app = SimpleNamespace(state=SimpleNamespace(uploads_root=os.getcwd()))
    scope = {"type": "http", "method": "POST", "path": "/", "headers": [], "app": app}
    return Request(scope)


@pytest.mark.asyncio
async def test_transcribe_voice_answer_rejects_unsupported_audio(monkeypatch):
    async def _noop():
        return None

    monkeypatch.setattr(flashcards_router, "_ensure_voice_quiz_schema", _noop)
    audio = UploadFile(
        filename="notes.txt",
        file=io.BytesIO(b"not-audio"),
        headers=Headers({"content-type": "text/plain"}),
    )
    with pytest.raises(HTTPException) as exc:
        await flashcards_router.transcribe_voice_answer(make_request(), audio=audio, user_id="alice")
    assert exc.value.status_code == 400
    assert "Unsupported audio type" in exc.value.detail


@pytest.mark.asyncio
async def test_transcribe_voice_answer_returns_transcript(monkeypatch):
    async def _noop():
        return None

    class FakeService:
        async def transcribe(self, audio_bytes: bytes, filename: str, content_type: str | None) -> str:
            assert audio_bytes == b"audio-bytes"
            assert filename == "voice.webm"
            assert content_type == "audio/webm"
            return "spoken answer"

    monkeypatch.setattr(flashcards_router, "_ensure_voice_quiz_schema", _noop)
    monkeypatch.setattr(flashcards_router, "get_transcription_service", lambda: FakeService())
    monkeypatch.setattr(flashcards_router.settings, "voice_quiz_persist_audio", False)

    audio = UploadFile(
        filename="voice.webm",
        file=io.BytesIO(b"audio-bytes"),
        headers=Headers({"content-type": "audio/webm"}),
    )
    result = await flashcards_router.transcribe_voice_answer(make_request(), audio=audio, user_id="alice")
    assert result.transcript == "spoken answer"
    assert result.audio_url is None


@pytest.mark.asyncio
async def test_transcribe_voice_answer_returns_unavailable_error(monkeypatch):
    async def _noop():
        return None

    class FakeService:
        async def transcribe(self, audio_bytes: bytes, filename: str, content_type: str | None) -> str:
            raise TranscriptionUnavailableError("Transcription is unavailable: OPENAI_API_KEY is missing.")

    monkeypatch.setattr(flashcards_router, "_ensure_voice_quiz_schema", _noop)
    monkeypatch.setattr(flashcards_router, "get_transcription_service", lambda: FakeService())

    audio = UploadFile(
        filename="voice.webm",
        file=io.BytesIO(b"audio-bytes"),
        headers=Headers({"content-type": "audio/webm"}),
    )
    with pytest.raises(HTTPException) as exc:
        await flashcards_router.transcribe_voice_answer(make_request(), audio=audio, user_id="alice")

    assert exc.value.status_code == 503
    assert exc.value.detail["code"] == "transcription_unavailable"
    assert "OPENAI_API_KEY is missing" in exc.value.detail["message"]


@pytest.mark.asyncio
async def test_transcribe_voice_answer_returns_transcription_failure(monkeypatch):
    async def _noop():
        return None

    class FakeService:
        async def transcribe(self, audio_bytes: bytes, filename: str, content_type: str | None) -> str:
            raise TranscriptionError("Transcription provider rejected the audio: Invalid file format.")

    monkeypatch.setattr(flashcards_router, "_ensure_voice_quiz_schema", _noop)
    monkeypatch.setattr(flashcards_router, "get_transcription_service", lambda: FakeService())

    audio = UploadFile(
        filename="voice.webm",
        file=io.BytesIO(b"audio-bytes"),
        headers=Headers({"content-type": "audio/webm"}),
    )
    with pytest.raises(HTTPException) as exc:
        await flashcards_router.transcribe_voice_answer(make_request(), audio=audio, user_id="alice")

    assert exc.value.status_code == 502
    assert exc.value.detail["code"] == "transcription_failed"
    assert "Invalid file format" in exc.value.detail["message"]


@pytest.mark.asyncio
async def test_save_voice_attempt_persists_attempt(monkeypatch):
    async def _noop(*args, **kwargs):
        return None

    async def _apply_review(*args, **kwargs):
        return {"next_review_at": "2026-03-08T00:00:00+00:00"}

    cursor = FakeCursor()
    cursor.fetchone_results = [(10, None)]
    monkeypatch.setattr(flashcards_router, "_ensure_voice_quiz_schema", _noop)
    monkeypatch.setattr(flashcards_router, "_ensure_class_owner", _noop)
    monkeypatch.setattr(flashcards_router, "apply_study_review", _apply_review)
    monkeypatch.setattr(flashcards_router, "db_conn", make_db_conn(cursor))

    payload = flashcards_router.VoiceAttemptReq(
        card_id="c9b289ac-6e4d-4f70-8b85-b2f0bd35f6d1",
        transcript="my spoken response",
        user_rating=4,
        response_time_seconds=3.5,
        audio_url="/uploads/voice_quiz/alice/sample.webm",
    )
    result = await flashcards_router.save_voice_attempt(payload, user_id="alice")

    assert result["ok"] is True
    assert result["mode"] == "voice"
    assert "attempt_id" in result
    inserts = [sql for sql, _ in cursor.executed if "INSERT INTO voice_quiz_attempts" in sql]
    assert len(inserts) == 1
