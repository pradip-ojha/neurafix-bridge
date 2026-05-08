"""
Practice proxy — forwards student practice requests to ai_service.

POST /api/practice/start       → ai_service (JSON)
POST /api/practice/submit      → ai_service (JSON)
POST /api/practice/close       → ai_service (JSON)
GET  /api/practice/history     → ai_service (JSON)
GET  /api/practice/chapters    → ai_service (JSON)
POST /api/practice/followup    → ai_service SSE passthrough
"""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.config import settings
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/practice", tags=["practice-proxy"])


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
    current_user: User = Depends(get_current_user),
):
    body = await request.body()
    auth_header = request.headers.get("Authorization", "")
    return await _forward_ai_post("/api/practice/start", body, auth_header)


@router.post("/submit")
async def proxy_submit(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    body = await request.body()
    auth_header = request.headers.get("Authorization", "")
    return await _forward_ai_post("/api/practice/submit", body, auth_header)


@router.post("/close")
async def proxy_close(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    body = await request.body()
    auth_header = request.headers.get("Authorization", "")
    return await _forward_ai_post("/api/practice/close", body, auth_header)


@router.get("/history")
async def proxy_history(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    auth_header = request.headers.get("Authorization", "")
    params = dict(request.query_params)
    return await _forward_ai_get("/api/practice/history", auth_header, params)


@router.get("/chapters")
async def proxy_chapters(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    auth_header = request.headers.get("Authorization", "")
    params = dict(request.query_params)
    return await _forward_ai_get("/api/practice/chapters", auth_header, params)


@router.post("/followup")
async def proxy_followup(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    body = await request.body()
    auth_header = request.headers.get("Authorization", "")

    async def generate():
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=None, write=10.0, pool=10.0)
        ) as client:
            async with client.stream(
                "POST",
                _ai_url("/api/practice/followup"),
                content=body,
                headers={"Authorization": auth_header, "Content-Type": "application/json"},
            ) as response:
                async for chunk in response.aiter_bytes():
                    yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
