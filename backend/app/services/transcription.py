import io
from dataclasses import dataclass
from typing import Protocol

from app.core.settings import settings


class TranscriptionError(Exception):
    pass


class TranscriptionUnavailableError(TranscriptionError):
    pass


class TranscriptionService(Protocol):
    async def transcribe(self, audio_bytes: bytes, filename: str, content_type: str | None) -> str:
        ...


@dataclass
class DisabledTranscriptionService:
    reason: str

    async def transcribe(self, audio_bytes: bytes, filename: str, content_type: str | None) -> str:
        raise TranscriptionUnavailableError(self.reason)


@dataclass
class OpenAITranscriptionService:
    model: str
    api_key: str
    language: str | None = None
    base_url: str | None = None
    provider_name: str = "OpenAI"

    async def transcribe(self, audio_bytes: bytes, filename: str, content_type: str | None) -> str:
        try:
            from openai import AsyncOpenAI
        except Exception as exc:
            raise TranscriptionError("openai package is required for OpenAI transcription") from exc

        client_kwargs = {"api_key": self.api_key}
        if self.base_url:
            client_kwargs["base_url"] = self.base_url
        client = AsyncOpenAI(**client_kwargs)
        file_like = io.BytesIO(audio_bytes)
        file_like.name = filename or "voice.webm"

        kwargs: dict = {
            "model": self.model,
            "file": file_like,
        }
        if self.language:
            kwargs["language"] = self.language

        try:
            response = await client.audio.transcriptions.create(**kwargs)
        except Exception as exc:
            status_code = getattr(exc, "status_code", None)
            provider_message = getattr(exc, "message", None) or str(exc)
            if status_code == 401:
                raise TranscriptionError(
                    f"{self.provider_name} transcription authentication failed. Check API key configuration."
                ) from exc
            if status_code == 429:
                raise TranscriptionError(
                    f"{self.provider_name} transcription rate limit reached. Please retry shortly."
                ) from exc
            if status_code == 400 and provider_message:
                raise TranscriptionError(
                    f"{self.provider_name} transcription rejected the audio: {provider_message}"
                ) from exc
            if provider_message:
                raise TranscriptionError(
                    f"{self.provider_name} transcription request failed: {provider_message}"
                ) from exc
            raise TranscriptionError("Failed to transcribe audio") from exc

        text = (getattr(response, "text", None) or "").strip()
        if not text:
            raise TranscriptionError("Transcription was empty")
        return text


def get_transcription_service() -> TranscriptionService:
    provider = (settings.transcription_provider or "auto").strip().lower()
    if provider == "auto":
        if settings.openai_api_key:
            provider = "openai"
        elif settings.groq_api_key:
            provider = "groq"
        else:
            provider = "disabled"

    if provider == "openai":
        if not settings.openai_api_key:
            return DisabledTranscriptionService(
                "Transcription is unavailable: OPENAI_API_KEY is missing while TRANSCRIPTION_PROVIDER=openai."
            )
        return OpenAITranscriptionService(
            model=settings.transcription_model,
            api_key=settings.openai_api_key,
            language=settings.transcription_language,
            provider_name="OpenAI",
        )
    if provider == "groq":
        if not settings.groq_api_key:
            return DisabledTranscriptionService(
                "Transcription is unavailable: GROQ_API_KEY is missing while TRANSCRIPTION_PROVIDER=groq."
            )
        model = settings.transcription_groq_model or "whisper-large-v3-turbo"
        return OpenAITranscriptionService(
            model=model,
            api_key=settings.groq_api_key,
            language=settings.transcription_language,
            base_url="https://api.groq.com/openai/v1",
            provider_name="Groq",
        )
    return DisabledTranscriptionService(
        "Transcription is unavailable: set TRANSCRIPTION_PROVIDER to auto, openai, or groq and configure the corresponding API key."
    )
