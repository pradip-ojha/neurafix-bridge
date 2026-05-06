from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_role
from app.database import get_db
from app.models.payment import Payment, PaymentStatus
from app.models.student_profile import StudentProfile, Stream
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/admin", tags=["admin-analytics"])

_admin_only = require_role("admin")


@router.get("/analytics/overview")
async def analytics_overview(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar_one()

    students = (
        await db.execute(select(func.count()).select_from(User).where(User.role == UserRole.student))
    ).scalar_one()

    affiliates = (
        await db.execute(
            select(func.count()).select_from(User).where(User.role == UserRole.affiliation_partner)
        )
    ).scalar_one()

    trial_count = (
        await db.execute(
            select(func.count()).select_from(Subscription).where(Subscription.status == SubscriptionStatus.trial)
        )
    ).scalar_one()

    active_count = (
        await db.execute(
            select(func.count()).select_from(Subscription).where(Subscription.status == SubscriptionStatus.active)
        )
    ).scalar_one()

    expired_count = (
        await db.execute(
            select(func.count()).select_from(Subscription).where(Subscription.status == SubscriptionStatus.expired)
        )
    ).scalar_one()

    science_count = (
        await db.execute(
            select(func.count()).select_from(StudentProfile).where(StudentProfile.stream == Stream.science)
        )
    ).scalar_one()

    management_count = (
        await db.execute(
            select(func.count()).select_from(StudentProfile).where(StudentProfile.stream == Stream.management)
        )
    ).scalar_one()

    pending_payments = (
        await db.execute(
            select(func.count()).select_from(Payment).where(Payment.status == PaymentStatus.pending)
        )
    ).scalar_one()

    recent_result = await db.execute(
        select(Payment).order_by(Payment.created_at.desc()).limit(5)
    )
    recent_payments = [
        {
            "id": p.id,
            "user_id": p.user_id,
            "amount": float(p.amount),
            "status": p.status,
            "created_at": p.created_at,
        }
        for p in recent_result.scalars().all()
    ]

    return {
        "total_users": total_users,
        "students": students,
        "affiliation_partners": affiliates,
        "subscriptions": {
            "trial": trial_count,
            "active": active_count,
            "expired": expired_count,
        },
        "streams": {
            "science": science_count,
            "management": management_count,
        },
        "pending_payments_count": pending_payments,
        "recent_payments": recent_payments,
    }
