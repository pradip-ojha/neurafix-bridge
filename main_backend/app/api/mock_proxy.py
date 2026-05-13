"""
Mock test proxy — forwards student mock test requests to ai_service.

POST /api/mock/start         → ai_service (JSON)
POST /api/mock/submit        → ai_service (JSON)
GET  /api/mock/history       → ai_service (JSON)
GET  /api/mock/leaderboard   → ai_service (JSON)
"""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.dependencies import get_current_user, get_subscribed_user
from app.core.rate_limiter import check_rate_limit
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/api/mock", tags=["mock-proxy"])


def _ai_url(path: str) -> str:
    return f"{settings.AI_SERVICE_URL}{path}"


async def _forward_ai_post(path: str, body: bytes, auth_header: str) -> JSONResponse:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            _ai_url(path),
            content=body,
            headers={"Authorization": auth_header, "Content-Type": "application/json"},
        )
    return JSONResponse(content=resp.json(), status_code=resp.status_code)


async def _forward_ai_get(path: str, auth_header: str, params: dict | None = None) -> JSONResponse:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            _ai_url(path),
            headers={"Authorization": auth_header},
            params=params or {},
        )
    return JSONResponse(content=resp.json(), status_code=resp.status_code)


@router.post("/start")
async def proxy_start(
    request: Request,
    current_user: User = Depends(get_subscribed_user),
    db: AsyncSession = Depends(get_db),
):
    body = await request.body()
    await check_rate_limit(current_user.id, "mock_test", db)
    auth_header = request.headers.get("Authorization", "")
    return await _forward_ai_post("/api/mock/start", body, auth_header)


@router.post("/submit")
async def proxy_submit(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    body = await request.body()
    auth_header = request.headers.get("Authorization", "")
    return await _forward_ai_post("/api/mock/submit", body, auth_header)


@router.get("/history")
async def proxy_history(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    auth_header = request.headers.get("Authorization", "")
    return await _forward_ai_get("/api/mock/history", auth_header)


@router.get("/leaderboard")
async def proxy_leaderboard(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    auth_header = request.headers.get("Authorization", "")
    params = dict(request.query_params)
    return await _forward_ai_get("/api/mock/leaderboard", auth_header, params)
