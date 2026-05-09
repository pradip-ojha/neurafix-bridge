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
    trial_duration_days: int | None = None
    referral_commission_pct: float | None = None
    referral_discount_pct: float | None = None
    trial_daily_message_limit: int | None = None
    paid_daily_message_limit: int | None = None
    payment_qr_url: str | None = None
    payment_instructions: str | None = None

_DEFAULT_SECONDS = 72
_DIFFICULTIES = ["easy", "medium", "hard"]


@router.get("/platform")
async def get_platform_config(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    config = (await db.execute(select(PlatformConfig).where(PlatformConfig.id == 1))).scalar_one_or_none()
    if not config:
        return {
            "subscription_price": 2000,
            "trial_duration_days": 7,
            "trial_daily_message_limit": 20,
            "paid_daily_message_limit": 50,
            "payment_qr_url": None,
            "payment_instructions": None,
        }
    return {
        "subscription_price": float(config.subscription_price),
        "trial_duration_days": config.trial_duration_days,
        "trial_daily_message_limit": config.trial_daily_message_limit,
        "paid_daily_message_limit": config.paid_daily_message_limit,
        "payment_qr_url": config.payment_qr_url,
        "payment_instructions": config.payment_instructions,
    }


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

    return {
        "subscription_price": float(config.subscription_price),
        "trial_duration_days": config.trial_duration_days,
        "referral_commission_pct": float(config.referral_commission_pct),
        "referral_discount_pct": float(config.referral_discount_pct),
        "trial_daily_message_limit": config.trial_daily_message_limit,
        "paid_daily_message_limit": config.paid_daily_message_limit,
        "payment_qr_url": config.payment_qr_url,
        "payment_instructions": config.payment_instructions,
    }


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
