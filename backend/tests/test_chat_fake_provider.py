import os
import importlib


def test_chat_completion_fake_provider(monkeypatch):
    monkeypatch.setenv("CHAT_PROVIDER", "fake")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    from app.core import chat_llm
    importlib.reload(chat_llm)

    out = chat_llm.chat_completion(
        "You are helpful.",
        "Question: What is included?\n\nContext:\nThis is context from the document about cells and DNA.",
    )
    assert isinstance(out, str)
    assert len(out) > 0


def test_chat_health_ok(monkeypatch):
    monkeypatch.setenv("CHAT_PROVIDER", "fake")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    from app.core import chat_llm
    importlib.reload(chat_llm)

    out = chat_llm.chat_completion("Reply with exactly: OK", "OK")
    assert out.strip() == "OK"
