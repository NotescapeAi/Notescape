from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    # loads .env automatically; ignores unknown keys; not case sensitive
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    api_title: str = Field(default="Notescape API", alias="API_TITLE")
    cors_origins: str = Field(default="http://localhost:5173", alias="CORS_ORIGINS")
    database_url: str = Field(
        default="postgresql://postgres@localhost:5432/notescape",
        alias="DATABASE_URL",
    )
    upload_root: str | None = Field(default=None, alias="UPLOAD_ROOT")

settings = Settings()  # ← IMPORTANT: no kwargs here
