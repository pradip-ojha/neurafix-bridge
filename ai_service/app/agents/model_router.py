from __future__ import annotations

import httpx
from agents import OpenAIChatCompletionsModel
from openai import AsyncAzureOpenAI

from app.config import settings


ROLES = {
    "tutor_fast": settings.MODEL_CHAT_FAST.strip(),
    "tutor_thinking": settings.MODEL_CHAT_THINKING.strip(),
    "personalization": settings.MODEL_CHAT_FAST.strip(),
    "session_memory": settings.MODEL_CHAT_FAST.strip(),
    "practice_filter": settings.MODEL_CHAT_FAST.strip(),
    "capsule_gen": settings.MODEL_CHAT_THINKING.strip(),
    "capsule_followup": settings.MODEL_CHAT_FAST.strip(),
    "consultant": settings.MODEL_CHAT_THINKING.strip(),
    "referral": settings.MODEL_CHAT_FAST.strip(),
}

_azure_client: AsyncAzureOpenAI | None = None


def get_azure_client() -> AsyncAzureOpenAI:
    global _azure_client
    if _azure_client is None:
        _azure_client = AsyncAzureOpenAI(
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT.strip(),
            api_key=settings.AZURE_OPENAI_API_KEY.strip(),
            api_version=settings.AZURE_OPENAI_API_VERSION.strip(),
            timeout=httpx.Timeout(60.0, connect=5.0),
        )
    return _azure_client


def get_model(role: str) -> OpenAIChatCompletionsModel:
    return OpenAIChatCompletionsModel(
        model=ROLES[role],
        openai_client=get_azure_client(),
    )
