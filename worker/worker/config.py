from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_ENV = Path(__file__).parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ROOT_ENV), extra="ignore")

    UPSTASH_REDIS_REST_URL: str
    UPSTASH_REDIS_REST_TOKEN: str
    MAIN_BACKEND_INTERNAL_SECRET: str
    APP_ENV: str = "development"

    # Internal service URLs
    MAIN_BACKEND_URL: str = "http://127.0.0.1:8000"
    AI_SERVICE_URL: str = "http://127.0.0.1:8001"

    @property
    def upstash_redis_hostname(self) -> str:
        url = self.UPSTASH_REDIS_REST_URL.strip()
        return url.replace("https://", "").replace("http://", "").rstrip("/")

    @property
    def celery_broker_url(self) -> str:
        return f"rediss://:{self.UPSTASH_REDIS_REST_TOKEN}@{self.upstash_redis_hostname}:6380"


settings = Settings()
