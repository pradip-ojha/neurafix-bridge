from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.personalization import PersonalizationSummary


async def get_summary(
    db: AsyncSession,
    user_id: str,
    agent_type: str,
    subject: str | None,
    timeline: str,
) -> PersonalizationSummary | None:
    stmt = select(PersonalizationSummary).where(
        PersonalizationSummary.user_id == user_id,
        PersonalizationSummary.agent_type == agent_type,
        PersonalizationSummary.subject == subject,
        PersonalizationSummary.timeline == timeline,
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def save_summary(
    db: AsyncSession,
    user_id: str,
    agent_type: str,
    subject: str | None,
    timeline: str,
    content: str,
    period_start: datetime,
    period_end: datetime,
) -> PersonalizationSummary:
    existing = await get_summary(db, user_id, agent_type, subject, timeline)
    if existing:
        existing.content = content
        existing.generated_at = datetime.utcnow()
        existing.covers_period_start = period_start
        existing.covers_period_end = period_end
        await db.commit()
        await db.refresh(existing)
        return existing

    summary = PersonalizationSummary(
        user_id=user_id,
        agent_type=agent_type,
        subject=subject,
        timeline=timeline,
        content=content,
        covers_period_start=period_start,
        covers_period_end=period_end,
    )
    db.add(summary)
    await db.commit()
    await db.refresh(summary)
    return summary


async def list_summaries(
    db: AsyncSession,
    user_id: str,
    agent_type: str | None = None,
    subject: str | None = None,
    timeline: str | None = None,
) -> list[PersonalizationSummary]:
    stmt = select(PersonalizationSummary).where(PersonalizationSummary.user_id == user_id)
    if agent_type:
        stmt = stmt.where(PersonalizationSummary.agent_type == agent_type)
    if subject:
        stmt = stmt.where(PersonalizationSummary.subject == subject)
    if timeline:
        stmt = stmt.where(PersonalizationSummary.timeline == timeline)
    result = await db.execute(stmt)
    return list(result.scalars().all())
