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


async def get(key: str) -> str | None:
    resp = await _get_client().get(f"/get/{key}")
    resp.raise_for_status()
    return resp.json().get("result")


async def set(key: str, value: str, ex: int | None = None) -> bool:
    parts = ["SET", key, value]
    if ex is not None:
        parts += ["EX", str(ex)]
    resp = await _get_client().post("/", json=parts)
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
    resp = await _get_client().get(f"/del/{key}")
    resp.raise_for_status()
    return resp.json().get("result", 0)


async def lpush(key: str, *values: str) -> int:
    resp = await _get_client().post("/", json=["LPUSH", key] + list(values))
    resp.raise_for_status()
    return resp.json().get("result", 0)


async def rpush(key: str, *values: str) -> int:
    resp = await _get_client().post("/", json=["RPUSH", key] + list(values))
    resp.raise_for_status()
    return resp.json().get("result", 0)


async def lrange(key: str, start: int = 0, stop: int = -1) -> list[str]:
    resp = await _get_client().get(f"/lrange/{key}/{start}/{stop}")
    resp.raise_for_status()
    return resp.json().get("result", [])


async def check_connection() -> bool:
    try:
        resp = await _get_client().get("/ping")
        return resp.json().get("result") == "PONG"
    except Exception:
        return False
