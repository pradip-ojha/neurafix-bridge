"""
Tutor proxy — forwards student tutor requests to ai_service.

All streaming endpoints use httpx.AsyncClient.stream() + FastAPI StreamingResponse.
JWT is validated here at main_backend, then forwarded to ai_service.

POST /api/tutor/chat                     → ai_service SSE passthrough
GET  /api/tutor/sessions                 → ai_service proxy
GET  /api/tutor/sessions/{id}/messages   → ai_service proxy
GET  /api/tutor/history                  → ai_service proxy
"""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.config import settings
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/tutor", tags=["tutor-proxy"])


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
async def proxy_tutor_chat(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """SSE-stream tutor response by forwarding to ai_service."""
    body = await request.body()
    auth_header = request.headers.get("Authorization", "")

    async def generate():
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=None, write=10.0, pool=10.0)
        ) as client:
            async with client.stream(
                "POST",
                _ai_url("/api/tutor/chat"),
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
    params = dict(request.query_params)
    return await _forward_ai_get("/api/tutor/sessions", auth_header, params)


@router.get("/sessions/{session_id}/messages")
async def proxy_session_messages(
    session_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    auth_header = request.headers.get("Authorization", "")
    return await _forward_ai_get(f"/api/tutor/sessions/{session_id}/messages", auth_header)


@router.get("/history")
async def proxy_history(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    auth_header = request.headers.get("Authorization", "")
    params = dict(request.query_params)
    return await _forward_ai_get("/api/tutor/history", auth_header, params)
