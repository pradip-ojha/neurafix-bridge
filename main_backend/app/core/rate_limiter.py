from __future__ import annotations

from datetime import UTC, datetime

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.platform_config import PlatformConfig
from app.models.subscription import Subscription, SubscriptionStatus


_FEATURE_TO_FIELD = {
    "tutor_fast": "tutor_fast_limit",
    "tutor_thinking": "tutor_thinking_limit",
    "tutor_deep": "tutor_deep_thinking_limit",
    "consultant_normal": "consultant_normal_limit",
    "consultant_thinking": "consultant_thinking_limit",
    "practice": "practice_limit",
    "mock_test": "mock_test_limit",
    "capsule_followup": "capsule_followup_limit",
}


async def check_rate_limit(user_id: str, feature: str, db: AsyncSession) -> None:
    if feature not in _FEATURE_TO_FIELD:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown rate limit feature: {feature}",
        )

    sub_result = await db.execute(select(Subscription).where(Subscription.user_id == user_id))
    sub = sub_result.scalar_one_or_none()

    config_result = await db.execute(select(PlatformConfig).where(PlatformConfig.id == 1))
    config = config_result.scalar_one_or_none()

    if not config:
        return  # no config row; skip rate limiting

    tier = "paid" if sub and sub.status in (SubscriptionStatus.active, SubscriptionStatus.trial) else "free"
    limit_field = f"{tier}_{_FEATURE_TO_FIELD[feature]}"
    limit = getattr(config, limit_field)

    date_str = datetime.now(UTC).strftime("%Y-%m-%d")
    key = f"ratelimit:{user_id}:{date_str}:{feature}"
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
            detail=f"Daily limit for {feature} reached. Upgrade to paid for more.",
        )
