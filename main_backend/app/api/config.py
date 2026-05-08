"""
Student-facing config endpoints.

GET /api/config/subject-timing  → timing config for a subject (seconds per question by difficulty)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.subject_timing import SubjectTimingConfig
from app.models.user import User

router = APIRouter(prefix="/api/config", tags=["config"])

_DEFAULT_SECONDS = 72
_DIFFICULTIES = ["easy", "medium", "hard"]


@router.get("/subject-timing")
async def get_subject_timing(
    subject: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(SubjectTimingConfig).where(SubjectTimingConfig.subject == subject)
    )).scalars().all()

    timing_map = {r.difficulty: r.seconds_per_question for r in rows}

    return {
        "subject": subject,
        "timing": [
            {
                "difficulty": diff,
                "seconds_per_question": timing_map.get(diff, _DEFAULT_SECONDS),
            }
            for diff in _DIFFICULTIES
        ],
    }
