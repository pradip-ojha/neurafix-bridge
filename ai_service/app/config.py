import re
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_ENV = Path(__file__).parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ROOT_ENV), extra="ignore")

    DATABASE_URL: str
    PINECONE_API_KEY: str
    OPENAI_API_KEY: Optional[str] = None
    AZURE_OPENAI_ENDPOINT: str
    AZURE_OPENAI_API_KEY: str
    AZURE_OPENAI_API_VERSION: str
    MODEL_CHAT_FAST: str
    MODEL_CHAT_THINKING: str
    MODEL_EMBEDDING: str
    UPSTASH_REDIS_REST_URL: str
    UPSTASH_REDIS_REST_TOKEN: str
    R2_ACCOUNT_ID: str
    R2_ENDPOINT: str
    R2_TOKEN_VALUE: str
    R2_ACCESS_KEY_ID: str
    R2_SECRET_ACCESS_KEY: str
    R2_BUCKET_NAME: str
    MAIN_BACKEND_INTERNAL_SECRET: str
    JWT_SECRET_KEY: str
    APP_ENV: str = "development"
    DEBUG: bool = True

    # URL of the main_backend service (for internal calls)
    MAIN_BACKEND_URL: str = "http://localhost:8000"

    @property
    def async_database_url(self) -> str:
        url = self.DATABASE_URL
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        url = re.sub(r"[&?]channel_binding=[^&]*", "", url)
        url = url.replace("sslmode=require", "ssl=require")
        url = re.sub(r"\?$", "", url)
        url = re.sub(r"&$", "", url)
        return url

    @property
    def upstash_redis_hostname(self) -> str:
        # Extract hostname from https://hostname
        url = self.UPSTASH_REDIS_REST_URL.strip()
        url = url.replace("https://", "").replace("http://", "")
        return url.rstrip("/")

    @property
    def celery_broker_url(self) -> str:
        # Upstash Redis TLS endpoint for Celery (port 6380)
        return f"rediss://:{self.UPSTASH_REDIS_REST_TOKEN}@{self.upstash_redis_hostname}:6380"


settings = Settings()
