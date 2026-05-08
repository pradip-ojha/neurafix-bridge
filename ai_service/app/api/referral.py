"""
Referral content generation.

POST /api/referral/generate-post  JWT → {post_text}
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import get_current_user_id
from app.agents.referral.agent import ReferralAgent

router = APIRouter(prefix="/api/referral", tags=["referral"])


class GeneratePostIn(BaseModel):
    referral_link: str
    platform_url: str
    user_message: str | None = None


@router.post("/generate-post")
async def generate_post(
    body: GeneratePostIn,
    user_id: str = Depends(get_current_user_id),
):
    agent = ReferralAgent()
    post_text = await agent.generate_post(
        referral_link=body.referral_link,
        platform_url=body.platform_url,
        user_message=body.user_message,
    )
    return {"post_text": post_text}
