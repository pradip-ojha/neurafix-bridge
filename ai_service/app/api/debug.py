"""Debug endpoint for inspecting assembled personalization context.
Removable after Phase 6 testing is complete.
"""
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.personalization import context_builder

router = APIRouter(prefix="/api/debug", tags=["debug"])


def _verify_internal(x_internal_secret: str = Header(default="")):
    if x_internal_secret != settings.MAIN_BACKEND_INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/context")
async def get_context(
    user_id: str = Query(...),
    subject: str = Query(...),
    chapter: str = Query(...),
    mode: str = Query(default="fast"),
    message: str = Query(default="[debug inspection]"),
    _: None = Depends(_verify_internal),
    db: AsyncSession = Depends(get_db),
):
    """Returns the assembled tutor context string for a given user and subject."""
    ctx, student_stream = await context_builder.build_tutor_context(
        db, user_id, subject, message, chapter, mode=mode
    )
    return {
        "user_id": user_id,
        "subject": subject,
        "student_stream": student_stream,
        "context": ctx,
    }


@router.get("/personalization-data")
async def get_personalization_data(
    user_id: str = Query(...),
    _: None = Depends(_verify_internal),
    db: AsyncSession = Depends(get_db),
):
    """Returns the full raw personalization data dict for a given user."""
    data = await context_builder.build_personalization_context(db, user_id)
    return data
