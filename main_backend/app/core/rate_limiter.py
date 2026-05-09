from __future__ import annotations

from datetime import UTC, datetime

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.platform_config import PlatformConfig
from app.models.subscription import Subscription, SubscriptionStatus


async def check_rate_limit(user_id: str, db: AsyncSession) -> None:
    sub_result = await db.execute(select(Subscription).where(Subscription.user_id == user_id))
    sub = sub_result.scalar_one_or_none()

    if not sub or sub.status == SubscriptionStatus.expired:
        return  # already blocked by subscription gate

    config_result = await db.execute(select(PlatformConfig).where(PlatformConfig.id == 1))
    config = config_result.scalar_one_or_none()

    if not config:
        return  # no config row; skip rate limiting

    limit = (
        config.trial_daily_message_limit
        if sub.status == SubscriptionStatus.trial
        else config.paid_daily_message_limit
    )

    date_str = datetime.now(UTC).strftime("%Y-%m-%d")
    key = f"ratelimit:{user_id}:{date_str}"
    base = settings.UPSTASH_REDIS_REST_URL
    headers = {"Authorization": f"Bearer {settings.UPSTASH_REDIS_REST_TOKEN}"}

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            incr_resp = await client.post(f"{base}/incr/{key}", headers=headers)
            count = incr_resp.json().get("result", 0)
            if count == 1:
                await client.post(f"{base}/expire/{key}/86400", headers=headers)
    except Exception:
        return  # Redis unavailable — fail open, don't block users

    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily message limit of {limit} reached. Resets tomorrow.",
        )
