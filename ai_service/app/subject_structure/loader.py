from __future__ import annotations

import logging

import httpx

from app import redis_client
from app.config import settings

logger = logging.getLogger(__name__)

_CACHE_TTL = 3600


async def get_chapter_structure(subject: str, chapter: str) -> dict:
    subject_key = subject.strip().lower().replace(" ", "_")
    chapter_key = chapter.strip().lower()
    cache_key = f"subject_structure:{subject_key}:{chapter_key}"

    try:
        cached = await redis_client.get_json(cache_key)
        if cached is not None:
            return cached
    except Exception:
        pass

    url = f"{settings.MAIN_BACKEND_URL}/api/internal/subject-structure/{subject_key}/chapters/{chapter_key}"
    headers = {"X-Internal-Secret": settings.MAIN_BACKEND_INTERNAL_SECRET}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            await redis_client.set_json(cache_key, data, ex=_CACHE_TTL)
            return data
    except Exception as exc:
        logger.warning(
            "Chapter structure fetch failed for subject=%s chapter=%s: %s",
            subject_key,
            chapter_key,
            exc,
        )

    try:
        stale = await redis_client.get_json(cache_key)
        if stale is not None:
            return stale
    except Exception:
        pass
    raise FileNotFoundError(f"No chapter structure found for subject={subject} chapter={chapter}")


async def get_chapter_names(subject: str) -> list[dict]:
    subject_key = subject.strip().lower().replace(" ", "_")
    cache_key = f"subject_chapter_names:{subject_key}"

    try:
        cached = await redis_client.get_json(cache_key)
        if cached is not None:
            return cached
    except Exception:
        pass

    url = f"{settings.MAIN_BACKEND_URL}/api/internal/subject-structure/{subject_key}/chapter-names"
    headers = {"X-Internal-Secret": settings.MAIN_BACKEND_INTERNAL_SECRET}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        await redis_client.set_json(cache_key, data, ex=_CACHE_TTL)
        return data
