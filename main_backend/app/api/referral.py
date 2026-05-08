"""
User-facing referral earnings.

GET /api/referral/my-earnings   JWT(any) → own referral earnings history
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.referral_earning import ReferralEarning
from app.models.user import User

router = APIRouter(prefix="/api/referral", tags=["referral"])


@router.get("/my-earnings")
async def my_earnings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ReferralEarning, User.full_name)
        .join(User, User.id == ReferralEarning.referred_user_id, isouter=True)
        .where(ReferralEarning.referrer_id == current_user.id)
        .order_by(ReferralEarning.created_at.desc())
    )

    rows = result.all()
    total_pending = sum(r.commission_amount for r, _ in rows if r.status.value == "pending")
    total_paid = sum(r.commission_amount for r, _ in rows if r.status.value == "paid")

    return {
        "total_pending": float(total_pending),
        "total_paid": float(total_paid),
        "earnings": [
            {
                "id": r.id,
                "referred_user_name": name or "Unknown",
                "commission_amount": float(r.commission_amount),
                "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                "created_at": r.created_at,
            }
            for r, name in rows
        ],
    }
