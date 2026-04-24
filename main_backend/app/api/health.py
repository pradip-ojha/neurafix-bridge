import httpx
from fastapi import APIRouter
from sqlalchemy import text

from app.config import settings
from app.database import AsyncSessionLocal

router = APIRouter()


@router.get("/health")
async def health_check():
    """Main backend health — checks DB connection."""
    db_status = "disconnected"
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "service": "main_backend",
        "status": "ok" if db_status == "connected" else "degraded",
        "db": db_status,
    }


@router.get("/api/health/services")
async def services_health():
    """
    Combined health for the frontend HealthCheck component.
    Fetches ai_service status internally — the browser never calls ai_service directly.
    """
    # main_backend db
    db_status = "disconnected"
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    # ai_service — called server-to-server, not browser-to-service
    ai_status: dict = {}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{settings.AI_SERVICE_URL}/health")
            ai_status = resp.json()
    except Exception as e:
        ai_status = {
            "service": "ai_service",
            "status": "unreachable",
            "error": str(e),
        }

    return {
        "main_backend": {
            "status": "ok" if db_status == "connected" else "degraded",
            "db": db_status,
        },
        "ai_service": ai_status,
    }
