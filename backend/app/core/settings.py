# app/core/settings.py
from typing import Optional
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
    cors_origins: str = Field(default="http://localhost:5173", alias="CORS_ORIGINS")

    database_url: str = Field(
        default="postgresql://notescape:notescape_pass@localhost:5432/notescape",
        alias="DATABASE_URL",
    )

    upload_root: Optional[str] = Field(default=None, alias="UPLOAD_ROOT")

    # LLM
    llm_provider: str = Field(default="fake", alias="LLM_PROVIDER")
    openai_chat_model: str = Field(default="gpt-4o-mini", alias="OPENAI_CHAT_MODEL")
    openai_embed_model: str = Field(default="text-embedding-3-small", alias="OPENAI_EMBED_MODEL")

settings = Settings()
