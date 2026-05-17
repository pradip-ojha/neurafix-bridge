"""
Config endpoints.

GET  /api/config/subject-timing   → timing config for a subject (seconds per question by difficulty)
GET  /api/config/platform         → public platform config (price, QR, limits)
PATCH /api/admin/config/platform  → admin: update platform config
"""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.platform_config import PlatformConfig
from app.models.subject_timing import SubjectTimingConfig
from app.models.user import User

router = APIRouter(prefix="/api/config", tags=["config"])

_admin_only = require_role("admin")


class PlatformConfigUpdate(BaseModel):
    subscription_price: float | None = None
    referral_commission_pct: float | None = None
    referral_discount_pct: float | None = None
    free_tutor_fast_limit: int | None = None
    free_tutor_thinking_limit: int | None = None
    free_tutor_deep_thinking_limit: int | None = None
    free_consultant_normal_limit: int | None = None
    free_consultant_thinking_limit: int | None = None
    free_practice_limit: int | None = None
    free_mock_test_limit: int | None = None
    free_capsule_followup_limit: int | None = None
    paid_tutor_fast_limit: int | None = None
    paid_tutor_thinking_limit: int | None = None
    paid_tutor_deep_thinking_limit: int | None = None
    paid_consultant_normal_limit: int | None = None
    paid_consultant_thinking_limit: int | None = None
    paid_practice_limit: int | None = None
    paid_mock_test_limit: int | None = None
    paid_capsule_followup_limit: int | None = None
    payment_qr_url: str | None = None
    payment_instructions: str | None = None
    stat_students_registered: int | None = None
    stat_mock_tests_attempted: int | None = None
    stat_questions_practiced: int | None = None
    stat_ai_tutor_messages: int | None = None
    stat_career_guidance_sessions: int | None = None
    stat_practice_sessions_completed: int | None = None

_DEFAULT_SECONDS = 72
_DIFFICULTIES = ["easy", "medium", "hard"]

_DEFAULT_LIMITS = {
    "free_tutor_fast_limit": 10,
    "free_tutor_thinking_limit": 5,
    "free_tutor_deep_thinking_limit": 3,
    "free_consultant_normal_limit": 5,
    "free_consultant_thinking_limit": 2,
    "free_practice_limit": 5,
    "free_mock_test_limit": 2,
    "free_capsule_followup_limit": 5,
    "paid_tutor_fast_limit": 100,
    "paid_tutor_thinking_limit": 50,
    "paid_tutor_deep_thinking_limit": 20,
    "paid_consultant_normal_limit": 30,
    "paid_consultant_thinking_limit": 15,
    "paid_practice_limit": 50,
    "paid_mock_test_limit": 20,
    "paid_capsule_followup_limit": 30,
}


_STAT_OVERRIDES = [
    "stat_students_registered",
    "stat_mock_tests_attempted",
    "stat_questions_practiced",
    "stat_ai_tutor_messages",
    "stat_career_guidance_sessions",
    "stat_practice_sessions_completed",
]


def _serialize_platform_config(config: PlatformConfig) -> dict:
    data = {
        "subscription_price": float(config.subscription_price),
        "referral_commission_pct": float(config.referral_commission_pct),
        "referral_discount_pct": float(config.referral_discount_pct),
        "payment_qr_url": config.payment_qr_url,
        "payment_instructions": config.payment_instructions,
    }
    for field in _DEFAULT_LIMITS:
        data[field] = getattr(config, field)
    for field in _STAT_OVERRIDES:
        data[field] = getattr(config, field, None)
    return data


@router.get("/platform")
async def get_platform_config(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    config = (await db.execute(select(PlatformConfig).where(PlatformConfig.id == 1))).scalar_one_or_none()
    if not config:
        return {
            "subscription_price": 2000,
            "referral_commission_pct": 10,
            "referral_discount_pct": 5,
            "payment_qr_url": None,
            "payment_instructions": None,
            **_DEFAULT_LIMITS,
        }
    return _serialize_platform_config(config)


@router.patch("/admin/platform", dependencies=[Depends(_admin_only)])
async def update_platform_config(
    body: PlatformConfigUpdate,
    db: AsyncSession = Depends(get_db),
):
    config = (await db.execute(select(PlatformConfig).where(PlatformConfig.id == 1))).scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Config not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(config, field, value)
    config.updated_at = datetime.now(UTC)

    db.add(config)
    await db.commit()
    await db.refresh(config)

    return _serialize_platform_config(config)


@router.get("/subject-timing")
async def get_subject_timing(
    subject: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(SubjectTimingConfig).where(SubjectTimingConfig.subject == subject)
    )).scalars().all()

    timing_map = {r.difficulty: r.seconds_per_question for r in rows}

    return {
        "subject": subject,
        "timing": [
            {
                "difficulty": diff,
                "seconds_per_question": timing_map.get(diff, _DEFAULT_SECONDS),
            }
            for diff in _DIFFICULTIES
        ],
    }
