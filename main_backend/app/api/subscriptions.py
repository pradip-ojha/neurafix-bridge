from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, verify_internal_secret
from app.database import get_db
from app.models.subscription import Subscription
from app.models.user import User

router = APIRouter(tags=["subscriptions"])


@router.get("/api/subscription/status")
async def subscription_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Subscription).where(Subscription.user_id == current_user.id))
    sub = result.scalar_one_or_none()
    if not sub:
        return {"status": "none", "trial_ends_at": None, "subscription_ends_at": None}
    return {
        "status": sub.status,
        "trial_ends_at": sub.trial_ends_at,
        "subscription_ends_at": sub.subscription_ends_at,
    }
