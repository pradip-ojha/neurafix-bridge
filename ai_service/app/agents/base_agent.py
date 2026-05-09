import httpx
from openai import AsyncOpenAI

from app.config import settings

TUTOR_MODEL = "gpt-4o"

_openai_client: AsyncOpenAI | None = None


def get_openai_client() -> AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            timeout=httpx.Timeout(60.0, connect=5.0),
        )
    return _openai_client
