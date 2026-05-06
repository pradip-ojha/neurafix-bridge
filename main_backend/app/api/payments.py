from __future__ import annotations

import mimetypes
import uuid
from datetime import datetime, UTC, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import r2_client
from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.payment import Payment, PaymentStatus
from app.models.platform_config import PlatformConfig
from app.models.referral_earning import ReferralEarning, ReferralEarningStatus
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User

router = APIRouter(tags=["payments"])

_admin_only = require_role("admin")


# ---------------------------------------------------------------------------
# Student
# ---------------------------------------------------------------------------

@router.post("/api/payments/submit", status_code=status.HTTP_201_CREATED)
async def submit_payment(
    amount: float = Form(..., gt=0),
    screenshot: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = await screenshot.read()
    if not data:
        raise HTTPException(status_code=400, detail="Screenshot file is empty")

    ext = mimetypes.guess_extension(screenshot.content_type or "") or ".jpg"
    key = f"payments/{current_user.id}/{uuid.uuid4()}{ext}"
    url = r2_client.upload_bytes(key, data, screenshot.content_type or "image/jpeg")

    # Apply referral discount if applicable
    discount_pct = 0.0
    if current_user.referred_by:
        config = (await db.execute(select(PlatformConfig).where(PlatformConfig.id == 1))).scalar_one_or_none()
        if config:
            discount_pct = float(config.referral_discount_pct)

    payment = Payment(
        user_id=current_user.id,
        amount=amount,
        screenshot_url=url,
        status=PaymentStatus.pending,
        referral_discount_pct=discount_pct,
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)

    return {"payment_id": payment.id, "status": payment.status, "amount": float(payment.amount)}


@router.get("/api/payments/my")
async def my_payments(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Payment).where(Payment.user_id == current_user.id).order_by(Payment.created_at.desc())
    )
    payments = result.scalars().all()
    return [
        {
            "id": p.id,
            "amount": float(p.amount),
            "status": p.status,
            "subscription_months": p.subscription_months,
            "referral_discount_pct": float(p.referral_discount_pct),
            "created_at": p.created_at,
        }
        for p in payments
    ]


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

@router.get("/api/admin/payments")
async def list_payments(
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    q = select(Payment).order_by(Payment.created_at.desc())
    if status_filter:
        q = q.where(Payment.status == status_filter)
    q = q.offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    payments = result.scalars().all()
    return [
        {
            "id": p.id,
            "user_id": p.user_id,
            "amount": float(p.amount),
            "screenshot_url": p.screenshot_url,
            "status": p.status,
            "approved_by": p.approved_by,
            "subscription_months": p.subscription_months,
            "referral_discount_pct": float(p.referral_discount_pct),
            "created_at": p.created_at,
        }
        for p in payments
    ]


async def _approve_payment(payment: Payment, subscription_months: int, admin_id: str, db: AsyncSession) -> None:
    payment.status = PaymentStatus.approved
    payment.approved_by = admin_id
    payment.subscription_months = subscription_months

    # Upsert subscription
    sub_result = await db.execute(select(Subscription).where(Subscription.user_id == payment.user_id))
    sub = sub_result.scalar_one_or_none()
    now = datetime.now(UTC)

    if sub:
        base = max(sub.subscription_ends_at or now, now)
        sub.status = SubscriptionStatus.active
        sub.subscription_ends_at = base + timedelta(days=30 * subscription_months)
        sub.updated_at = now
    else:
        sub = Subscription(
            user_id=payment.user_id,
            status=SubscriptionStatus.active,
            trial_ends_at=now,
            subscription_ends_at=now + timedelta(days=30 * subscription_months),
            updated_at=now,
        )
        db.add(sub)

    # Create referral earning if applicable
    user_result = await db.execute(select(User).where(User.id == payment.user_id))
    payer = user_result.scalar_one_or_none()
    if payer and payer.referred_by:
        config = (await db.execute(select(PlatformConfig).where(PlatformConfig.id == 1))).scalar_one_or_none()
        commission_pct = float(config.referral_commission_pct) if config else 10.0
        commission = float(payment.amount) * commission_pct / 100
        db.add(ReferralEarning(
            referrer_id=payer.referred_by,
            referred_user_id=payer.id,
            payment_id=payment.id,
            commission_amount=commission,
            status=ReferralEarningStatus.pending,
        ))


@router.post("/api/admin/payments/{payment_id}/approve")
async def approve_payment(
    payment_id: str,
    subscription_months: int = Query(1, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(_admin_only),
):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.status != PaymentStatus.pending:
        raise HTTPException(status_code=400, detail=f"Payment is already {payment.status}")

    await _approve_payment(payment, subscription_months, admin.id, db)
    await db.commit()
    return {"message": "Payment approved", "payment_id": payment_id}


@router.post("/api/admin/payments/{payment_id}/reject")
async def reject_payment(
    payment_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(_admin_only),
):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.status != PaymentStatus.pending:
        raise HTTPException(status_code=400, detail=f"Payment is already {payment.status}")

    payment.status = PaymentStatus.rejected
    payment.approved_by = admin.id
    await db.commit()
    return {"message": "Payment rejected", "payment_id": payment_id}


@router.post("/api/admin/payments/approve-all-pending")
async def approve_all_pending(
    subscription_months: int = Query(1, ge=1, le=24),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(_admin_only),
):
    result = await db.execute(select(Payment).where(Payment.status == PaymentStatus.pending))
    pending = result.scalars().all()
    for p in pending:
        await _approve_payment(p, subscription_months, admin.id, db)
    await db.commit()
    return {"approved": len(pending), "subscription_months": subscription_months}
