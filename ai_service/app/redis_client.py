"""
Upstash Redis client using the REST API (httpx).
Upstash provides an HTTP REST endpoint — we do NOT use socket-based redis-py here.
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
    url = settings.UPSTASH_REDIS_REST_URL.rstrip("/")
    return url


async def get(key: str) -> str | None:
    """Get a value by key. Returns None if key does not exist."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_base_url()}/get/{key}",
            headers=_headers(),
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("result")


async def set(key: str, value: str, ex: int | None = None) -> bool:
    """Set a key. Optional ex = TTL in seconds."""
    parts = ["SET", key, value]
    if ex is not None:
        parts += ["EX", str(ex)]
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_base_url()}",
            headers=_headers(),
            json=parts,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("result") == "OK"


async def set_json(key: str, value: Any, ex: int | None = None) -> bool:
    """Serialize value to JSON and store it."""
    return await set(key, json.dumps(value), ex=ex)


async def get_json(key: str) -> Any | None:
    """Get and deserialize a JSON value."""
    raw = await get(key)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return raw


async def delete(key: str) -> int:
    """Delete a key. Returns number of keys deleted."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_base_url()}/del/{key}",
            headers=_headers(),
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("result", 0)


async def lpush(key: str, *values: str) -> int:
    """Push values to the head of a list."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_base_url()}",
            headers=_headers(),
            json=["LPUSH", key] + list(values),
        )
        resp.raise_for_status()
        return resp.json().get("result", 0)


async def rpush(key: str, *values: str) -> int:
    """Append values to the tail of a list (chronological order)."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_base_url()}",
            headers=_headers(),
            json=["RPUSH", key] + list(values),
        )
        resp.raise_for_status()
        return resp.json().get("result", 0)


async def lrange(key: str, start: int = 0, stop: int = -1) -> list[str]:
    """Get a range of list elements."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_base_url()}/lrange/{key}/{start}/{stop}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json().get("result", [])


async def check_connection() -> bool:
    """Ping Upstash REST endpoint."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{_base_url()}/ping",
                headers=_headers(),
                timeout=5.0,
            )
            data = resp.json()
            return data.get("result") == "PONG"
    except Exception:
        return False
