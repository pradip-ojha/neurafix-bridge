from __future__ import annotations

import asyncio
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import redis_client
from app.core.dependencies import get_current_user
from app.core.email_service import send_otp_email
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_referral_code,
    hash_password,
    hash_token,
    verify_password,
)
from app.database import get_db
from app.models.affiliation_profile import AffiliationProfile
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    SendOtpRequest,
    TokenResponse,
    UserOut,
    VerifyOtpRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_TTL = 7 * 24 * 3600  # 7 days
OTP_TTL = 900                 # 15 minutes
OTP_SEND_LIMIT = 3
OTP_SEND_WINDOW = 3600        # 1 hour
OTP_MAX_ATTEMPTS = 3


def _make_tokens(user_id: str, role: str) -> tuple[str, str]:
    data = {"sub": user_id, "role": role}
    return create_access_token(data), create_refresh_token(data)


def _generate_otp() -> str:
    return str(secrets.randbelow(900000) + 100000)


async def _store_and_send_otp(email: str) -> None:
    """Store a fresh OTP in Redis and dispatch the email as a background task."""
    otp = _generate_otp()
    await redis_client.set(f"otp:{email}", otp, ex=OTP_TTL)
    await redis_client.set(f"otp_attempts:{email}", "0", ex=OTP_TTL)
    count = await redis_client.incr(f"otp_send_count:{email}")
    if count == 1:
        await redis_client.expire(f"otp_send_count:{email}", OTP_SEND_WINDOW)
    asyncio.create_task(send_otp_email(email, otp))


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    referred_by_id: str | None = None
    if body.referral_code:
        ref_result = await db.execute(select(User).where(User.referral_code == body.referral_code))
        referrer = ref_result.scalar_one_or_none()
        if referrer:
            referred_by_id = referrer.id

    for _ in range(5):
        code = generate_referral_code()
        clash = await db.execute(select(User).where(User.referral_code == code))
        if not clash.scalar_one_or_none():
            break

    user = User(
        full_name=body.full_name,
        email=body.email,
        hashed_password=hash_password(body.password),
        referral_code=code,
        referred_by=referred_by_id,
        email_verified=False,
    )
    db.add(user)
    await db.flush()
    db.add(Subscription(user_id=user.id, status=SubscriptionStatus.free, trial_ends_at=None))

    if referred_by_id:
        aff_result = await db.execute(
            select(AffiliationProfile).where(AffiliationProfile.user_id == referred_by_id)
        )
        aff_profile = aff_result.scalar_one_or_none()
        if aff_profile:
            aff_profile.total_referrals += 1
        else:
            db.add(AffiliationProfile(user_id=referred_by_id, total_referrals=1))

    await db.commit()
    await db.refresh(user)

    access_token, refresh_token = _make_tokens(user.id, user.role.value)
    await redis_client.set(f"refresh:{user.id}", hash_token(refresh_token), ex=REFRESH_TTL)

    # Send first OTP (non-blocking)
    await _store_and_send_otp(user.email)

    return RegisterResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")
    if not user.email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="email_not_verified")

    access_token, refresh_token = _make_tokens(user.id, user.role.value)
    await redis_client.set(f"refresh:{user.id}", hash_token(refresh_token), ex=REFRESH_TTL)

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserOut.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    stored_hash = await redis_client.get(f"refresh:{user_id}")
    if not stored_hash or stored_hash != hash_token(body.refresh_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token invalid or expired")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    access_token, new_refresh_token = _make_tokens(user.id, user.role.value)
    await redis_client.set(f"refresh:{user.id}", hash_token(new_refresh_token), ex=REFRESH_TTL)

    return TokenResponse(access_token=access_token, refresh_token=new_refresh_token)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.post("/send-verification-otp", status_code=status.HTTP_200_OK)
async def send_verification_otp(body: SendOtpRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user:
        # Don't reveal whether the email is registered
        return {"detail": "If that email is registered, a code has been sent."}

    if user.email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already verified")

    send_count_raw = await redis_client.get(f"otp_send_count:{body.email}")
    send_count = int(send_count_raw) if send_count_raw else 0
    if send_count >= OTP_SEND_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again in 1 hour.",
        )

    await _store_and_send_otp(body.email)
    return {"detail": "If that email is registered, a code has been sent."}


@router.post("/verify-otp", status_code=status.HTTP_200_OK)
async def verify_otp(body: VerifyOtpRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    attempts_raw = await redis_client.get(f"otp_attempts:{body.email}")
    attempts = int(attempts_raw) if attempts_raw else 0
    if attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Request a new code.",
        )

    stored_otp = await redis_client.get(f"otp:{body.email}")
    if not stored_otp or stored_otp != body.otp:
        await redis_client.incr(f"otp_attempts:{body.email}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    user.email_verified = True
    await db.commit()

    await redis_client.delete(f"otp:{body.email}")
    await redis_client.delete(f"otp_attempts:{body.email}")

    return {"detail": "Email verified successfully"}
