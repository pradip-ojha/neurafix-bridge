"""
Progress stats endpoint.

GET /api/progress/stats  JWT → aggregated practice + mock stats
"""
from __future__ import annotations

from datetime import datetime, timedelta, UTC

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user_id
from app.database import get_db
from app.models.mock_session import MockSession, MockSessionStatus
from app.models.personalization import PracticeSessionSummary
from app.models.practice_session import PracticeSession, PracticeSessionStatus

router = APIRouter(prefix="/api/progress", tags=["progress"])


@router.get("/stats")
async def get_progress_stats(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    now = datetime.now(UTC)
    seven_days_ago = now - timedelta(days=7)

    # Practice sessions per day (last 7 days)
    ps_result = await db.execute(
        select(
            func.date(PracticeSession.created_at).label("day"),
            func.count(PracticeSession.id).label("cnt"),
        )
        .where(
            PracticeSession.user_id == user_id,
            PracticeSession.created_at >= seven_days_ago,
            PracticeSession.status != PracticeSessionStatus.active,
        )
        .group_by(func.date(PracticeSession.created_at))
        .order_by(func.date(PracticeSession.created_at))
    )
    practice_sessions_this_week = [
        {"date": str(row.day), "count": row.cnt} for row in ps_result
    ]

    # Fill missing days with 0
    existing_days = {entry["date"] for entry in practice_sessions_this_week}
    for i in range(7):
        day = (seven_days_ago + timedelta(days=i + 1)).date()
        if str(day) not in existing_days:
            practice_sessions_this_week.append({"date": str(day), "count": 0})
    practice_sessions_this_week.sort(key=lambda x: x["date"])

    # Mock score trend (last 10 submitted sessions)
    mock_result = await db.execute(
        select(MockSession)
        .where(
            MockSession.user_id == user_id,
            MockSession.status == MockSessionStatus.submitted,
        )
        .order_by(MockSession.created_at.desc())
        .limit(10)
    )
    mock_sessions = mock_result.scalars().all()
    mock_score_trend = []
    for ms in reversed(mock_sessions):
        score_pct = None
        if ms.score_data:
            total = ms.score_data.get("total_questions", 0)
            correct = ms.score_data.get("total_correct", 0)
            if total > 0:
                score_pct = round(correct / total * 100, 1)
        mock_score_trend.append({
            "date": str(ms.session_date),
            "score_pct": score_pct,
        })

    # Avg score by subject from practice session summaries
    subject_result = await db.execute(
        select(
            PracticeSessionSummary.subject,
            func.sum(PracticeSessionSummary.correct_count).label("total_correct"),
            func.sum(PracticeSessionSummary.total_questions).label("total_q"),
        )
        .where(PracticeSessionSummary.user_id == user_id)
        .group_by(PracticeSessionSummary.subject)
    )
    avg_score_by_subject: dict[str, float] = {}
    for row in subject_result:
        if row.total_q and row.total_q > 0:
            avg_score_by_subject[row.subject] = round(row.total_correct / row.total_q * 100, 1)

    # Totals
    total_practice = await db.scalar(
        select(func.count(PracticeSession.id)).where(
            PracticeSession.user_id == user_id,
            PracticeSession.status != PracticeSessionStatus.active,
        )
    ) or 0

    total_mock = await db.scalar(
        select(func.count(MockSession.id)).where(
            MockSession.user_id == user_id,
            MockSession.status == MockSessionStatus.submitted,
        )
    ) or 0

    return {
        "practice_sessions_this_week": practice_sessions_this_week,
        "mock_score_trend": mock_score_trend,
        "avg_score_by_subject": avg_score_by_subject,
        "total_practice_sessions": total_practice,
        "total_mock_sessions": total_mock,
    }
