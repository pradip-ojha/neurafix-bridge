"""
Progress proxy — forwards to ai_service progress stats.

GET /api/progress/overview → ai_service GET /api/progress/stats
"""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.core.dependencies import require_role
from app.models.user import User

router = APIRouter(prefix="/api/progress", tags=["progress-proxy"])

_student_only = require_role("student")


@router.get("/overview")
async def proxy_overview(
    request: Request,
    current_user: User = Depends(_student_only),
):
    auth_header = request.headers.get("Authorization", "")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{settings.AI_SERVICE_URL}/api/progress/stats",
            headers={"Authorization": auth_header},
        )
    return JSONResponse(content=resp.json(), status_code=resp.status_code)
