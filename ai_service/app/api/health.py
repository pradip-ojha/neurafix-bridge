from fastapi import APIRouter
from sqlalchemy import text

from app.database import AsyncSessionLocal
from app.r2_client import check_connection as r2_check
from app.pinecone_client import check_connection as pinecone_check
from app import redis_client

router = APIRouter()


@router.get("/health")
async def health_check():
    db_status = "disconnected"
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    pinecone_status = "connected" if pinecone_check() else "error"

    r2_status = "connected" if r2_check() else "error"

    redis_ok = await redis_client.check_connection()
    redis_status = "connected" if redis_ok else "error"

    all_ok = all(s == "connected" for s in [db_status, pinecone_status, r2_status, redis_status])

    return {
        "service": "ai_service",
        "status": "ok" if all_ok else "degraded",
        "db": db_status,
        "pinecone": pinecone_status,
        "r2": r2_status,
        "redis": redis_status,
    }
