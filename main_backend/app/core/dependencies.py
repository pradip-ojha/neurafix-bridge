from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.security import decode_token
from app.database import get_db
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = decode_token(token)
    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")
    return user


def require_role(*roles: str):
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.value not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {', '.join(roles)}",
            )
        return current_user

    return _check


async def verify_internal_secret(request: Request) -> None:
    secret = request.headers.get("X-Internal-Secret")
    if not secret or secret != settings.MAIN_BACKEND_INTERNAL_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


async def get_subscribed_user(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Like get_current_user but also enforces active/trial subscription."""
    result = await db.execute(select(Subscription).where(Subscription.user_id == current_user.id))
    sub = result.scalar_one_or_none()
    now = datetime.now(UTC)

    if not sub:
        raise HTTPException(status_code=402, detail="No active subscription")

    now = datetime.now(UTC)

    # Trial period ended → downgrade to free
    if sub.status == SubscriptionStatus.trial and sub.trial_ends_at and sub.trial_ends_at < now:
        sub.status = SubscriptionStatus.free
        await db.commit()
        raise HTTPException(status_code=402, detail="Your trial has ended. Please subscribe.")

    # Paid subscription ended → downgrade to free
    if sub.status == SubscriptionStatus.active and sub.subscription_ends_at and sub.subscription_ends_at < now:
        sub.status = SubscriptionStatus.free
        await db.commit()
        raise HTTPException(status_code=402, detail="Your subscription has expired. Please renew.")

    # Free tier and legacy expired → blocked
    if sub.status in (SubscriptionStatus.free, SubscriptionStatus.expired):
        raise HTTPException(status_code=402, detail="Please subscribe to access this feature.")

    # trial (active) and active → allowed
    return current_user


async def get_rate_limited_user(
    current_user: User = Depends(get_subscribed_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Subscription-gated user with daily message rate limiting."""
    from app.core.rate_limiter import check_rate_limit
    await check_rate_limit(current_user.id, db)
    return current_user
