from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    API_TITLE: str = "Notescape API"
    CORS_ORIGINS: str = "http://localhost:5173"
    # add DB_URL, SECRET_KEY, etc.

    class Config:
        env_file = ".env"

settings = Settings()
