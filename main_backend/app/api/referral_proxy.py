"""
Referral proxy — forwards post generation to ai_service, injecting the user's referral link.

POST /api/referral/generate-post → ai_service POST /api/referral/generate-post
"""
from __future__ import annotations

import json

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/referral", tags=["referral-proxy"])


@router.post("/generate-post")
async def proxy_generate_post(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    body_bytes = await request.body()
    try:
        body = json.loads(body_bytes) if body_bytes else {}
    except Exception:
        body = {}

    referral_link = f"{settings.FRONTEND_URL}/register?ref={current_user.referral_code}"
    body["referral_link"] = referral_link

    auth_header = request.headers.get("Authorization", "")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{settings.AI_SERVICE_URL}/api/referral/generate-post",
            content=json.dumps(body),
            headers={"Authorization": auth_header, "Content-Type": "application/json"},
        )
    return JSONResponse(content=resp.json(), status_code=resp.status_code)
