"""
Consultant proxy — forwards student consultant requests to ai_service.

POST /api/consultant/chat                   → ai_service SSE passthrough
GET  /api/consultant/sessions               → ai_service proxy
GET  /api/consultant/sessions/{id}/messages → ai_service proxy
GET  /api/consultant/timeline               → ai_service proxy
"""
from __future__ import annotations

import json

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.dependencies import get_current_user, get_subscribed_user
from app.core.rate_limiter import check_rate_limit
from app.database import get_db
from app.models.user import User

router = APIRouter(prefix="/api/consultant", tags=["consultant-proxy"])


def _ai_url(path: str) -> str:
    return f"{settings.AI_SERVICE_URL}{path}"


async def _forward_ai_get(path: str, auth_header: str, params: dict | None = None) -> JSONResponse:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            _ai_url(path),
            headers={"Authorization": auth_header},
            params=params or {},
        )
    return JSONResponse(content=resp.json(), status_code=resp.status_code)


@router.post("/chat")
async def proxy_consultant_chat(
    request: Request,
    current_user: User = Depends(get_subscribed_user),
    db: AsyncSession = Depends(get_db),
):
    """SSE-stream consultant response by forwarding to ai_service."""
    body = await request.body()
    try:
        payload = json.loads(body or b"{}")
    except json.JSONDecodeError:
        payload = {}
    feature = "consultant_thinking" if payload.get("mode") == "thinking" else "consultant_normal"
    await check_rate_limit(current_user.id, feature, db)
    auth_header = request.headers.get("Authorization", "")

    async def generate():
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=None, write=10.0, pool=10.0)
        ) as client:
            async with client.stream(
                "POST",
                _ai_url("/api/consultant/chat"),
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


@router.get("/sessions")
async def proxy_sessions(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    auth_header = request.headers.get("Authorization", "")
    return await _forward_ai_get("/api/consultant/sessions", auth_header)


@router.get("/sessions/{session_id}/messages")
async def proxy_session_messages(
    session_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    auth_header = request.headers.get("Authorization", "")
    return await _forward_ai_get(f"/api/consultant/sessions/{session_id}/messages", auth_header)


@router.get("/timeline")
async def proxy_timeline(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    auth_header = request.headers.get("Authorization", "")
    return await _forward_ai_get("/api/consultant/timeline", auth_header)
