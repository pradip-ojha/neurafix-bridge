from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_role
from app.database import get_db
from app.models.referral_earning import ReferralEarning, ReferralEarningStatus
from app.models.user import User

router = APIRouter(prefix="/api/admin", tags=["admin-referrals"])

_admin_only = require_role("admin")


@router.get("/referral-earnings")
async def list_referral_earnings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    result = await db.execute(
        select(ReferralEarning).order_by(ReferralEarning.created_at.desc())
    )
    earnings = result.scalars().all()

    referrer_ids = list({e.referrer_id for e in earnings})
    referrers: dict[str, User] = {}
    if referrer_ids:
        user_result = await db.execute(select(User).where(User.id.in_(referrer_ids)))
        referrers = {u.id: u for u in user_result.scalars().all()}

    return [
        {
            "id": e.id,
            "referrer_id": e.referrer_id,
            "referrer_name": referrers.get(e.referrer_id, User()).full_name if e.referrer_id in referrers else None,
            "referred_user_id": e.referred_user_id,
            "payment_id": e.payment_id,
            "commission_amount": float(e.commission_amount),
            "status": e.status,
            "created_at": e.created_at,
        }
        for e in earnings
    ]


@router.patch("/referral-earnings/{earning_id}/mark-paid")
async def mark_earning_paid(
    earning_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    result = await db.execute(select(ReferralEarning).where(ReferralEarning.id == earning_id))
    earning = result.scalar_one_or_none()
    if not earning:
        raise HTTPException(status_code=404, detail="Earning not found")
    if earning.status == ReferralEarningStatus.paid:
        raise HTTPException(status_code=400, detail="Already marked as paid")

    earning.status = ReferralEarningStatus.paid
    await db.commit()
    return {"message": "Marked as paid", "id": earning_id}
