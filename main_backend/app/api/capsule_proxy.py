"""
Capsule proxy — forwards student capsule requests to ai_service.

GET  /api/capsule/{subject}              → ai_service JSON proxy
GET  /api/capsule/{subject}/history      → ai_service JSON proxy
GET  /api/capsule/{subject}/{date}       → ai_service JSON proxy
POST /api/capsule/{subject}/chat         → ai_service SSE passthrough
"""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.config import settings
from app.core.dependencies import get_current_user, get_rate_limited_user, get_subscribed_user
from app.models.user import User

router = APIRouter(prefix="/api/capsule", tags=["capsule-proxy"])


def _ai_url(path: str) -> str:
    return f"{settings.AI_SERVICE_URL}{path}"


async def _forward_ai_get(path: str, auth_header: str) -> JSONResponse:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            _ai_url(path),
            headers={"Authorization": auth_header},
        )
    return JSONResponse(content=resp.json(), status_code=resp.status_code)


@router.get("/{subject}/history")
async def proxy_capsule_history(
    subject: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    auth_header = request.headers.get("Authorization", "")
    return await _forward_ai_get(f"/api/capsule/{subject}/history", auth_header)


@router.get("/{subject}/{capsule_date}")
async def proxy_capsule_by_date(
    subject: str,
    capsule_date: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    auth_header = request.headers.get("Authorization", "")
    return await _forward_ai_get(f"/api/capsule/{subject}/{capsule_date}", auth_header)


@router.post("/{subject}/chat")
async def proxy_capsule_chat(
    subject: str,
    request: Request,
    current_user: User = Depends(get_rate_limited_user),
):
    """SSE-stream capsule chat response by forwarding to ai_service."""
    body = await request.body()
    auth_header = request.headers.get("Authorization", "")

    async def generate():
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=None, write=10.0, pool=10.0)
        ) as client:
            async with client.stream(
                "POST",
                _ai_url(f"/api/capsule/{subject}/chat"),
                content=body,
                headers={
                    "Authorization": auth_header,
                    "Content-Type": "application/json",
                },
            ) as response:
                async for chunk in response.aiter_bytes():
                    yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/{subject}")
async def proxy_capsule_today(
    subject: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    auth_header = request.headers.get("Authorization", "")
    return await _forward_ai_get(f"/api/capsule/{subject}", auth_header)
