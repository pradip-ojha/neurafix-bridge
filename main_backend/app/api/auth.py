from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import redis_client
from app.core.dependencies import get_current_user
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
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
    UserOut,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_TTL = 7 * 24 * 3600  # 7 days in seconds


def _make_tokens(user_id: str, role: str) -> tuple[str, str]:
    data = {"sub": user_id, "role": role}
    return create_access_token(data), create_refresh_token(data)


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

    # Generate unique referral code
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
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token, refresh_token = _make_tokens(user.id, user.role.value)
    await redis_client.set(f"refresh:{user.id}", hash_token(refresh_token), ex=REFRESH_TTL)

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
