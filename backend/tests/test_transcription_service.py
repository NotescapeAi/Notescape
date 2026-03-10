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

from app.services import transcription as tx


def test_get_transcription_service_prefers_openai_in_auto(monkeypatch):
    monkeypatch.setattr(tx.settings, "transcription_provider", "auto")
    monkeypatch.setattr(tx.settings, "openai_api_key", "openai-key")
    monkeypatch.setattr(tx.settings, "groq_api_key", "groq-key")
    monkeypatch.setattr(tx.settings, "transcription_model", "gpt-4o-mini-transcribe")

    svc = tx.get_transcription_service()
    assert isinstance(svc, tx.OpenAITranscriptionService)
    assert svc.provider_name == "OpenAI"
    assert svc.base_url is None


def test_get_transcription_service_uses_groq_when_openai_missing(monkeypatch):
    monkeypatch.setattr(tx.settings, "transcription_provider", "auto")
    monkeypatch.setattr(tx.settings, "openai_api_key", None)
    monkeypatch.setattr(tx.settings, "groq_api_key", "groq-key")
    monkeypatch.setattr(tx.settings, "transcription_groq_model", "whisper-large-v3-turbo")

    svc = tx.get_transcription_service()
    assert isinstance(svc, tx.OpenAITranscriptionService)
    assert svc.provider_name == "Groq"
    assert svc.base_url == "https://api.groq.com/openai/v1"
    assert svc.model == "whisper-large-v3-turbo"


def test_get_transcription_service_disabled_without_keys(monkeypatch):
    monkeypatch.setattr(tx.settings, "transcription_provider", "auto")
    monkeypatch.setattr(tx.settings, "openai_api_key", None)
    monkeypatch.setattr(tx.settings, "groq_api_key", None)

    svc = tx.get_transcription_service()
    assert isinstance(svc, tx.DisabledTranscriptionService)
