from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    api_title: str = Field(default="Notescape API", alias="API_TITLE")

    database_url: str = Field(alias="DATABASE_URL")
    cors_origins: str = Field(alias="CORS_ORIGINS")

    upload_root: str = Field(alias="UPLOAD_ROOT")

    storage_backend: str = Field(default="s3", alias="STORAGE_BACKEND")
    s3_endpoint_url: str = Field(alias="S3_ENDPOINT_URL")
    s3_access_key: str = Field(alias="S3_ACCESS_KEY")
    s3_secret_key: str = Field(alias="S3_SECRET_KEY")
    s3_bucket: str = Field(alias="S3_BUCKET")
    s3_region: str = Field(default="us-east-1", alias="S3_REGION")

    chat_provider: str = Field(default="groq", alias="CHAT_PROVIDER")
    chat_model: str = Field(default="llama-3.3-70b-versatile", alias="CHAT_MODEL")
    groq_api_key: str | None = Field(default=None, alias="GROQ_API_KEY")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    transcription_provider: str = Field(default="auto", alias="TRANSCRIPTION_PROVIDER")
    transcription_model: str = Field(default="gpt-4o-mini-transcribe", alias="TRANSCRIPTION_MODEL")
    transcription_groq_model: str = Field(default="whisper-large-v3-turbo", alias="TRANSCRIPTION_GROQ_MODEL")
    transcription_language: str | None = Field(default=None, alias="TRANSCRIPTION_LANGUAGE")
    voice_quiz_max_audio_mb: int = Field(default=12, alias="VOICE_QUIZ_MAX_AUDIO_MB")
    voice_quiz_persist_audio: bool = Field(default=False, alias="VOICE_QUIZ_PERSIST_AUDIO")
    safe_mode: bool = Field(default=False, alias="SAFE_MODE")
    require_email_verified: bool = Field(default=False, alias="REQUIRE_EMAIL_VERIFIED")
    ocr_provider: str = Field(default="local", alias="OCR_PROVIDER")
    ocr_handwritten_enabled: bool = Field(default=True, alias="OCR_HANDWRITTEN_ENABLED")
    ocr_max_upload_mb: int = Field(default=40, alias="OCR_MAX_UPLOAD_MB")
    google_application_credentials: str | None = Field(default=None, alias="GOOGLE_APPLICATION_CREDENTIALS")
    azure_document_intelligence_endpoint: str | None = Field(default=None, alias="AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
    azure_document_intelligence_key: str | None = Field(default=None, alias="AZURE_DOCUMENT_INTELLIGENCE_KEY")
    mathpix_app_id: str | None = Field(default=None, alias="MATHPIX_APP_ID")
    mathpix_app_key: str | None = Field(default=None, alias="MATHPIX_APP_KEY")


settings = Settings()
