"""
Public endpoints — no authentication required.

GET /api/public/stats     → platform activity counts
GET /api/public/faqs      → active homepage FAQs
GET /api/public/homepage  → homepage config (demo video URL)
"""
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.homepage_faq import HomepageFAQ
from app.models.platform_config import PlatformConfig
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/stats")
async def public_stats(db: AsyncSession = Depends(get_db)):
    students_registered = (
        await db.execute(
            select(func.count()).select_from(User).where(User.role == UserRole.student)
        )
    ).scalar_one()

    ai_stats: dict = {}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{settings.AI_SERVICE_URL}/api/internal/platform-stats",
                headers={"x-internal-secret": settings.MAIN_BACKEND_INTERNAL_SECRET},
            )
            if resp.status_code == 200:
                ai_stats = resp.json()
    except Exception:
        pass

    return {
        "students_registered": students_registered,
        "mock_tests_attempted": ai_stats.get("mock_tests_attempted", 0),
        "questions_practiced": ai_stats.get("questions_practiced", 0),
        "ai_tutor_messages": ai_stats.get("ai_tutor_messages", 0),
        "career_guidance_sessions": ai_stats.get("career_guidance_sessions", 0),
        "practice_sessions_completed": ai_stats.get("practice_sessions_completed", 0),
    }


@router.get("/faqs")
async def public_faqs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(HomepageFAQ)
        .where(HomepageFAQ.is_active == True)  # noqa: E712
        .order_by(HomepageFAQ.display_order.asc(), HomepageFAQ.id.asc())
    )
    faqs = result.scalars().all()
    return [
        {"id": f.id, "question": f.question, "answer": f.answer}
        for f in faqs
    ]


@router.get("/homepage")
async def public_homepage(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PlatformConfig).where(PlatformConfig.id == 1))
    config = result.scalar_one_or_none()
    return {"demo_video_url": config.demo_video_url if config else None}
