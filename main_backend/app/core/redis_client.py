"""
Upstash Redis client using the REST API (httpx).
Used in main_backend for: refresh token storage, rate limiting.
"""
import json
from typing import Any

import httpx

from app.config import settings


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.UPSTASH_REDIS_REST_TOKEN}",
        "Content-Type": "application/json",
    }


def _base_url() -> str:
    return settings.UPSTASH_REDIS_REST_URL.rstrip("/")


async def get(key: str) -> str | None:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{_base_url()}/get/{key}", headers=_headers())
        resp.raise_for_status()
        return resp.json().get("result")


async def set(key: str, value: str, ex: int | None = None) -> bool:
    parts = ["SET", key, value]
    if ex is not None:
        parts += ["EX", str(ex)]
    async with httpx.AsyncClient() as client:
        resp = await client.post(_base_url(), headers=_headers(), json=parts)
        resp.raise_for_status()
        return resp.json().get("result") == "OK"


async def set_json(key: str, value: Any, ex: int | None = None) -> bool:
    return await set(key, json.dumps(value), ex=ex)


async def get_json(key: str) -> Any | None:
    raw = await get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return raw


async def delete(key: str) -> int:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{_base_url()}/del/{key}", headers=_headers())
        resp.raise_for_status()
        return resp.json().get("result", 0)
