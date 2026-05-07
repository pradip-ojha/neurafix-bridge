from __future__ import annotations

import uuid
from datetime import datetime, date, UTC

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.personalization import (
    ConsultantTimeline,
    OverallStudentSummary,
    PracticeSessionSummary,
    SessionMemory,
    StudentLevel,
    SubjectSummary,
    SummaryType,
)

_PLACEHOLDER = "[No summary yet]"
_DEFAULT_LEVEL = 2


# ---------------------------------------------------------------------------
# Overall student summary
# ---------------------------------------------------------------------------

async def get_or_placeholder_overall(db: AsyncSession, user_id: str) -> str:
    stmt = select(OverallStudentSummary).where(OverallStudentSummary.user_id == user_id)
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    return row.content if row else _PLACEHOLDER


async def save_overall_summary(
    db: AsyncSession,
    user_id: str,
    content: str,
    covers_through: date,
) -> OverallStudentSummary:
    stmt = select(OverallStudentSummary).where(OverallStudentSummary.user_id == user_id)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        existing.content = content
        existing.covers_through = covers_through
        existing.generated_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(existing)
        return existing
    row = OverallStudentSummary(user_id=user_id, content=content, covers_through=covers_through)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Subject summaries (all_time / weekly / daily)
# ---------------------------------------------------------------------------

async def get_or_placeholder(
    db: AsyncSession,
    user_id: str,
    subject: str,
    summary_type: str,
    summary_date: date | None = None,
) -> str:
    stmt = select(SubjectSummary).where(
        SubjectSummary.user_id == user_id,
        SubjectSummary.subject == subject,
        SubjectSummary.summary_type == summary_type,
    )
    if summary_type == SummaryType.daily:
        stmt = stmt.where(SubjectSummary.summary_date == summary_date)
    else:
        stmt = stmt.where(SubjectSummary.summary_date.is_(None))
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    return row.content if row else _PLACEHOLDER


async def save_subject_summary(
    db: AsyncSession,
    user_id: str,
    subject: str,
    summary_type: str,
    content: str,
    summary_date: date | None = None,
) -> SubjectSummary:
    # For all_time/weekly: upsert (one row per type per subject)
    if summary_type != SummaryType.daily:
        stmt = select(SubjectSummary).where(
            SubjectSummary.user_id == user_id,
            SubjectSummary.subject == subject,
            SubjectSummary.summary_type == summary_type,
            SubjectSummary.summary_date.is_(None),
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            existing.content = content
            existing.generated_at = datetime.now(UTC)
            await db.commit()
            await db.refresh(existing)
            return existing

    # For daily: also upsert on (user, subject, type, date)
    if summary_type == SummaryType.daily and summary_date:
        stmt = select(SubjectSummary).where(
            SubjectSummary.user_id == user_id,
            SubjectSummary.subject == subject,
            SubjectSummary.summary_type == summary_type,
            SubjectSummary.summary_date == summary_date,
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            existing.content = content
            existing.generated_at = datetime.now(UTC)
            await db.commit()
            await db.refresh(existing)
            return existing

    row = SubjectSummary(
        user_id=user_id,
        subject=subject,
        summary_type=summary_type,
        content=content,
        summary_date=summary_date,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_last_n_daily_summaries(
    db: AsyncSession,
    user_id: str,
    subject: str,
    n: int = 7,
) -> list[SubjectSummary]:
    stmt = (
        select(SubjectSummary)
        .where(
            SubjectSummary.user_id == user_id,
            SubjectSummary.subject == subject,
            SubjectSummary.summary_type == SummaryType.daily,
        )
        .order_by(SubjectSummary.summary_date.desc())
        .limit(n)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Practice session summaries
# ---------------------------------------------------------------------------

async def save_practice_session_summary(
    db: AsyncSession,
    user_id: str,
    subject: str,
    chapter: str,
    session_date: date,
    total_questions: int,
    correct_count: int,
    incorrect_count: int,
    topic_breakdown: dict,
    summary_content: str,
) -> PracticeSessionSummary:
    row = PracticeSessionSummary(
        user_id=user_id,
        subject=subject,
        chapter=chapter,
        session_date=session_date,
        total_questions=total_questions,
        correct_count=correct_count,
        incorrect_count=incorrect_count,
        topic_breakdown=topic_breakdown,
        summary_content=summary_content,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_today_practice_summaries(
    db: AsyncSession,
    user_id: str,
    subject: str | None = None,
) -> list[PracticeSessionSummary]:
    today = datetime.now(UTC).date()
    stmt = select(PracticeSessionSummary).where(
        PracticeSessionSummary.user_id == user_id,
        PracticeSessionSummary.session_date == today,
    )
    if subject:
        stmt = stmt.where(PracticeSessionSummary.subject == subject)
    stmt = stmt.order_by(PracticeSessionSummary.created_at.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Student level
# ---------------------------------------------------------------------------

async def get_student_level(db: AsyncSession, user_id: str, subject: str) -> int:
    stmt = select(StudentLevel).where(
        StudentLevel.user_id == user_id,
        StudentLevel.subject == subject,
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    return row.level if row else _DEFAULT_LEVEL


async def upsert_student_level(
    db: AsyncSession,
    user_id: str,
    subject: str,
    level: int,
) -> StudentLevel:
    stmt = select(StudentLevel).where(
        StudentLevel.user_id == user_id,
        StudentLevel.subject == subject,
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        existing.level = level
        existing.assigned_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(existing)
        return existing
    row = StudentLevel(user_id=user_id, subject=subject, level=level)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Consultant timeline
# ---------------------------------------------------------------------------

async def get_consultant_timeline(db: AsyncSession, user_id: str) -> ConsultantTimeline | None:
    stmt = select(ConsultantTimeline).where(ConsultantTimeline.user_id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def save_consultant_timeline(
    db: AsyncSession,
    user_id: str,
    content: str,
) -> ConsultantTimeline:
    stmt = select(ConsultantTimeline).where(ConsultantTimeline.user_id == user_id)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        existing.content = content
        existing.last_updated = datetime.now(UTC)
        existing.version += 1
        await db.commit()
        await db.refresh(existing)
        return existing
    row = ConsultantTimeline(user_id=user_id, content=content)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Session memory
# ---------------------------------------------------------------------------

async def upsert_session_memory(
    db: AsyncSession,
    session_id: str,
    user_id: str,
    subject: str | None,
    content: str,
    message_count: int,
) -> SessionMemory:
    stmt = select(SessionMemory).where(SessionMemory.session_id == session_id)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        existing.content = content
        existing.message_count_at_generation = message_count
        existing.generated_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(existing)
        return existing
    row = SessionMemory(
        session_id=session_id,
        user_id=user_id,
        subject=subject,
        content=content,
        message_count_at_generation=message_count,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def get_session_memory(db: AsyncSession, session_id: str) -> SessionMemory | None:
    stmt = select(SessionMemory).where(SessionMemory.session_id == session_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
