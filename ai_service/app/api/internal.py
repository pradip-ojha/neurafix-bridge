"""
Internal endpoints — called by worker jobs only.
All endpoints require X-Internal-Secret header.

GET  /api/internal/active-users
POST /api/internal/personalization/generate-daily-summary
POST /api/internal/personalization/generate-capsule
POST /api/internal/personalization/regenerate-weekly-summary
POST /api/internal/personalization/update-alltime-summary
POST /api/internal/personalization/review-consultant
GET  /api/internal/student-level/{user_id}
"""
from __future__ import annotations

import logging
from datetime import date, datetime, UTC

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import func

from app.config import settings
from app.database import get_db
from app.models.chat_session import ChatSession, ChatMessage, MessageRole
from app.models.mock_session import MockSession
from app.models.personalization import AgentType
from app.models.practice_session import PracticeSession
from app.personalization import summary_manager
from app.agents.personalization.agent import (
    generate_daily_summary,
    regenerate_weekly_summary,
    update_alltime_summary,
    update_overall_summary,
    assign_level,
    review_consultant,
)
from app.agents.capsule.agent import CapsuleAgent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal", tags=["internal"])

_ALL_SUBJECTS = [
    "mathematics",
    "optional_math",
    "english",
    "science",
]


def _verify_secret(x_internal_secret: str = Header(...)) -> None:
    if x_internal_secret != settings.MAIN_BACKEND_INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")


# ---------------------------------------------------------------------------
# Active users
# ---------------------------------------------------------------------------

@router.get("/active-users")
async def get_active_users(
    _: None = Depends(_verify_secret),
    db: AsyncSession = Depends(get_db),
):
    """Return user_ids that had any activity today (practice, tutor, or consultant chat)."""
    today = datetime.now(UTC).date()

    # Users with any chat session today
    stmt = (
        select(ChatSession.user_id)
        .where(ChatSession.session_date == today)
        .distinct()
    )
    result = await db.execute(stmt)
    chat_users = {row[0] for row in result.all()}

    # Users with practice sessions today
    from app.models.personalization import PracticeSessionSummary
    stmt2 = (
        select(PracticeSessionSummary.user_id)
        .where(PracticeSessionSummary.session_date == today)
        .distinct()
    )
    result2 = await db.execute(stmt2)
    practice_users = {row[0] for row in result2.all()}

    all_users = list(chat_users | practice_users)
    return {"user_ids": all_users, "count": len(all_users)}


# ---------------------------------------------------------------------------
# Public stats (called by main_backend's /api/public/stats)
# ---------------------------------------------------------------------------

@router.get("/platform-stats")
async def get_platform_stats(
    _: None = Depends(_verify_secret),
    db: AsyncSession = Depends(get_db),
):
    mock_tests = (await db.execute(select(func.count()).select_from(MockSession))).scalar_one()
    practice_sessions = (await db.execute(select(func.count()).select_from(PracticeSession))).scalar_one()

    questions_practiced = (
        await db.execute(
            select(func.coalesce(func.sum(func.jsonb_array_length(PracticeSession.question_ids)), 0))
        )
    ).scalar_one()

    tutor_sessions = (
        await db.execute(
            select(func.count())
            .select_from(ChatSession)
            .where(ChatSession.agent_type == AgentType.tutor)
        )
    ).scalar_one()

    ai_tutor_messages = (
        await db.execute(
            select(func.count())
            .select_from(ChatMessage)
            .join(ChatSession, ChatMessage.session_id == ChatSession.id)
            .where(
                ChatSession.agent_type == AgentType.tutor,
                ChatMessage.role == MessageRole.assistant,
            )
        )
    ).scalar_one()

    career_sessions = (
        await db.execute(
            select(func.count())
            .select_from(ChatSession)
            .where(ChatSession.agent_type == AgentType.consultant)
        )
    ).scalar_one()

    return {
        "mock_tests_attempted": mock_tests,
        "practice_sessions_completed": practice_sessions,
        "questions_practiced": int(questions_practiced),
        "tutor_sessions": tutor_sessions,
        "ai_tutor_messages": ai_tutor_messages,
        "career_guidance_sessions": career_sessions,
    }


# ---------------------------------------------------------------------------
# Personalization endpoints
# ---------------------------------------------------------------------------

class DailySummaryRequest(BaseModel):
    user_id: str
    subject: str
    date: date


@router.post("/personalization/generate-daily-summary")
async def api_generate_daily_summary(
    req: DailySummaryRequest,
    _: None = Depends(_verify_secret),
    db: AsyncSession = Depends(get_db),
):
    content = await generate_daily_summary(db, req.user_id, req.subject, req.date)
    return {"status": "ok", "user_id": req.user_id, "subject": req.subject, "date": str(req.date)}


class CapsuleRequest(BaseModel):
    user_id: str
    subject: str
    date: date


@router.post("/personalization/generate-capsule")
async def api_generate_capsule(
    req: CapsuleRequest,
    _: None = Depends(_verify_secret),
    db: AsyncSession = Depends(get_db),
):
    agent = CapsuleAgent(user_id=req.user_id, subject=req.subject)
    await agent.generate_and_save(db, capsule_date=req.date)
    return {"status": "ok", "user_id": req.user_id, "subject": req.subject, "date": str(req.date)}


class WeeklySummaryRequest(BaseModel):
    user_id: str
    subject: str


@router.post("/personalization/regenerate-weekly-summary")
async def api_regenerate_weekly_summary(
    req: WeeklySummaryRequest,
    _: None = Depends(_verify_secret),
    db: AsyncSession = Depends(get_db),
):
    await regenerate_weekly_summary(db, req.user_id, req.subject)
    return {"status": "ok", "user_id": req.user_id, "subject": req.subject}


class AlltimeSummaryRequest(BaseModel):
    user_id: str
    subject: str


@router.post("/personalization/update-alltime-summary")
async def api_update_alltime_summary(
    req: AlltimeSummaryRequest,
    _: None = Depends(_verify_secret),
    db: AsyncSession = Depends(get_db),
):
    await update_alltime_summary(db, req.user_id, req.subject)
    return {"status": "ok", "user_id": req.user_id, "subject": req.subject}


class ReviewConsultantRequest(BaseModel):
    user_id: str


@router.post("/personalization/review-consultant")
async def api_review_consultant(
    req: ReviewConsultantRequest,
    _: None = Depends(_verify_secret),
    db: AsyncSession = Depends(get_db),
):
    await review_consultant(db, req.user_id)
    return {"status": "ok", "user_id": req.user_id}


# ---------------------------------------------------------------------------
# Student level
# ---------------------------------------------------------------------------

@router.get("/student-level/{user_id}")
async def api_get_student_level(
    user_id: str,
    subject: str | None = Query(default=None),
    _: None = Depends(_verify_secret),
    db: AsyncSession = Depends(get_db),
):
    if subject:
        level = await summary_manager.get_student_level(db, user_id, subject)
        return {"user_id": user_id, "subject": subject, "level": level}

    # Return levels for all subjects
    levels = {}
    for subj in _ALL_SUBJECTS:
        levels[subj] = await summary_manager.get_student_level(db, user_id, subj)
    return {"user_id": user_id, "levels": levels}
