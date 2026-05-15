"""
Upstash Redis client using the REST API (httpx).
Uses a singleton AsyncClient to reuse the TCP connection across calls.
"""
import json
from typing import Any

import httpx

from app.config import settings

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=settings.UPSTASH_REDIS_REST_URL.rstrip("/"),
            headers={
                "Authorization": f"Bearer {settings.UPSTASH_REDIS_REST_TOKEN}",
                "Content-Type": "application/json",
            },
            timeout=5.0,
        )
    return _client


async def close() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def _cmd(*args: Any) -> Any:
    """Send a Redis command via the Upstash REST pipeline (POST /)."""
    resp = await _get_client().post("/", json=list(args))
    resp.raise_for_status()
    return resp.json().get("result")


async def get(key: str) -> str | None:
    return await _cmd("GET", key)


async def set(key: str, value: str, ex: int | None = None) -> bool:
    if ex is not None:
        result = await _cmd("SET", key, value, "EX", str(ex))
    else:
        result = await _cmd("SET", key, value)
    return result == "OK"


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
    result = await _cmd("DEL", key)
    return int(result or 0)


async def incr(key: str) -> int:
    result = await _cmd("INCR", key)
    return int(result or 0)


async def expire(key: str, seconds: int) -> bool:
    result = await _cmd("EXPIRE", key, str(seconds))
    return result == 1
