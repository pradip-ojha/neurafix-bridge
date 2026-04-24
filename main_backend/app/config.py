import re
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


# Root .env is two levels up from this file: app/config.py → app/ → main_backend/ → root/
ROOT_ENV = Path(__file__).parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ROOT_ENV), extra="ignore")

    DATABASE_URL: str
    JWT_SECRET_KEY: str
    MAIN_BACKEND_INTERNAL_SECRET: str
    ALLOWED_ORIGINS: str = '["http://localhost:5173","http://localhost:3000"]'
    APP_ENV: str = "development"
    DEBUG: bool = True

    # Upstash Redis (for refresh token storage)
    UPSTASH_REDIS_REST_URL: str
    UPSTASH_REDIS_REST_TOKEN: str

    # Cloudflare R2 (for marksheet + payment screenshot uploads)
    R2_ENDPOINT: str
    R2_ACCESS_KEY_ID: str
    R2_SECRET_ACCESS_KEY: str
    R2_BUCKET_NAME: str

    # Internal URL of the ai_service (for proxied calls)
    AI_SERVICE_URL: str = "http://localhost:8001"

    @property
    def async_database_url(self) -> str:
        url = self.DATABASE_URL
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        # asyncpg does not support channel_binding — strip it
        url = re.sub(r"[&?]channel_binding=[^&]*", "", url)
        # asyncpg uses ssl=require not sslmode=require
        url = url.replace("sslmode=require", "ssl=require")
        # Clean up any trailing ? or dangling &
        url = re.sub(r"\?$", "", url)
        url = re.sub(r"&$", "", url)
        return url

    @property
    def allowed_origins_list(self) -> list[str]:
        import json
        try:
            return json.loads(self.ALLOWED_ORIGINS)
        except Exception:
            return [self.ALLOWED_ORIGINS]


settings = Settings()
