from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
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


settings = Settings()
