import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import pytest

from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "postgresql://notescape:notescape_pass@localhost/notescape")
os.environ.setdefault("CORS_ORIGINS", "http://localhost")
os.environ.setdefault("UPLOAD_ROOT", ".")
os.environ.setdefault("S3_ENDPOINT_URL", "https://example.com")
os.environ.setdefault("S3_ACCESS_KEY", "fake")
os.environ.setdefault("S3_SECRET_KEY", "fake")
os.environ.setdefault("S3_BUCKET", "fake")
os.environ.setdefault("CHAT_PROVIDER", "fake")
os.environ.setdefault("CHAT_MODEL", "fake")

from app.routers import chat_sessions as chat_sessions_router
from app.routers.flashcards import GenerateReq, _enqueue_flashcard_job


class FakeCursor:
    def __init__(self):
        self.executed = []
        self.fetchall_results = []
        self.fetchone_results = []
        self.description = []

    async def execute(self, sql: str, params=None):
        self.executed.append((sql.strip(), params))

    async def fetchall(self):
        if not self.fetchall_results:
            return []
        return self.fetchall_results.pop(0)

    async def fetchone(self):
        if not self.fetchone_results:
            return None
        return self.fetchone_results.pop(0)


class FakeConn:
    def __init__(self):
        self.committed = False

    async def commit(self):
        self.committed = True


def make_db_conn(*cursors):
    iterator = iter(cursors)

    @asynccontextmanager
    async def _ctx():
        cur = next(iterator)
        conn = FakeConn()
        try:
            yield conn, cur
        finally:
            pass

    return _ctx


async def _noop(*args, **kwargs):
    return None


    cursor = FakeCursor()
    cursor.fetchall_results = [[("file-uuid",)]]
    cursor.fetchone_results = [
        (
            "job-uuid",
            5,
            "queued",
            0,
            "corr-123",
            None,
            datetime.now(timezone.utc),
        )
    ]
    monkeypatch.setattr("app.routers.flashcards._ensure_class_owner", _noop)
    monkeypatch.setattr("app.routers.flashcards.db_conn", make_db_conn(cursor))

    req = GenerateReq(class_id=5, file_ids=["file-uuid"])
    job = await _enqueue_flashcard_job(req, "alice")

    assert job.correlation_id == "corr-123"
    assert cursor.executed[0][0].startswith("SELECT id::text FROM files")
    assert "flashcard_jobs" in cursor.executed[1][0]


@pytest.mark.asyncio
async def test_list_session_messages_uses_session_scope(monkeypatch):
    cursor = FakeCursor()
    cursor.fetchone_results = [(1,)]
    cursor.fetchall_results = [
        [("msg-1", "assistant", "hi", None, datetime.now(timezone.utc))]
    ]
    monkeypatch.setattr("app.routers.chat_sessions._ensure_chat_schema", _noop)
    chat_sessions_router._schema_checked = False
    monkeypatch.setattr(
        "app.routers.chat_sessions.db_conn",
        make_db_conn(cursor),
    )

    messages = await chat_sessions_router.list_session_messages("sess-1", "bob")

    assert len(messages) == 1
    assert "FROM chat_sessions" in cursor.executed[0][0]
    assert "SELECT id::text, role, content" in cursor.executed[1][0]


@pytest.mark.asyncio
async def test_list_session_messages_rejects_wrong_user(monkeypatch):
    cursor = FakeCursor()
    cursor.fetchone_results = [None]
    monkeypatch.setattr("app.routers.chat_sessions._ensure_chat_schema", _noop)
    monkeypatch.setattr(
        "app.routers.chat_sessions.db_conn",
        make_db_conn(cursor),
    )

    with pytest.raises(HTTPException):
        await chat_sessions_router.list_session_messages("sess-2", "evil")
