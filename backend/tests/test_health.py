# backend/tests/test_health.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    """Basic health endpoint returns status ok."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_health_db(monkeypatch):
    """DB health should return expected keys (mock DB if needed)."""

    # If you don’t want to hit a real DB in CI, you can patch db_conn.
    # For now we just call it live:
    resp = client.get("/health/db")

    assert resp.status_code == 200
    data = resp.json()

    # Top-level keys always present
    assert "ok" in data
    assert "database" in data
    assert "user" in data
    assert "server_version" in data
    assert "pgvector" in data
    assert "tables" in data

    # pgvector flags
    assert isinstance(data["pgvector"], dict)
    assert "installed" in data["pgvector"]

    # tables dict should have these keys
    for tbl in ["classes", "files", "chunks", "embeddings", "flashcards"]:
        assert tbl in data["tables"]

