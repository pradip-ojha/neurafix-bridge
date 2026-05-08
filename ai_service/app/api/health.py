import asyncio
import time

from fastapi import APIRouter
from sqlalchemy import text

from app.database import AsyncSessionLocal
from app.r2_client import check_connection as r2_check
from app.pinecone_client import check_connection as pinecone_check
from app import redis_client

router = APIRouter()

_cache: dict = {"result": None, "expires_at": 0.0}


async def _check_db() -> str:
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return "connected"
    except Exception as e:
        return f"error: {e}"


async def _check_pinecone() -> str:
    try:
        ok = await asyncio.to_thread(pinecone_check)
        return "connected" if ok else "error"
    except Exception:
        return "error"


async def _check_r2() -> str:
    try:
        ok = await asyncio.to_thread(r2_check)
        return "connected" if ok else "error"
    except Exception:
        return "error"


async def _check_redis() -> str:
    try:
        ok = await redis_client.check_connection()
        return "connected" if ok else "error"
    except Exception:
        return "error"


@router.get("/health")
async def health_check():
    now = time.time()
    if _cache["result"] is not None and now < _cache["expires_at"]:
        return _cache["result"]

    db, pinecone, r2, redis = await asyncio.gather(
        _check_db(), _check_pinecone(), _check_r2(), _check_redis()
    )

    all_ok = all(s == "connected" for s in [db, pinecone, r2, redis])
    result = {
        "service": "ai_service",
        "status": "ok" if all_ok else "degraded",
        "db": db,
        "pinecone": pinecone,
        "r2": r2,
        "redis": redis,
    }
    _cache["result"] = result
    _cache["expires_at"] = now + 30
    return result
