# app/core/settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import Optional

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    api_title: str = Field(default="Notescape API", alias="API_TITLE")
    cors_origins: str = Field(default="http://localhost:5173", alias="CORS_ORIGINS")

    database_url: str = Field(
        default="postgresql://notescape:notescape_pass@localhost:5432/notescape",
        alias="DATABASE_URL",
    )

    # Where uploaded files live; if unset we use <project-root>/uploads
    upload_root: Optional[str] = Field(default=None, alias="UPLOAD_ROOT")

    # LLM provider: "fake" (free dev) or "openai"
    llm_provider: str = Field(default="fake", alias="LLM_PROVIDER")

    # OpenAI API key (only needed if provider=openai)
    openai_api_key: Optional[str] = Field(default=None, alias="OPENAI_API_KEY")

settings = Settings()
