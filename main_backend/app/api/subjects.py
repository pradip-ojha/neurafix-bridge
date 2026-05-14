from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.subject_chapter import SubjectChapter
from app.models.user import User

router = APIRouter(prefix="/api/subjects", tags=["subjects"])


@router.get("/{subject}/chapters")
async def list_chapters_for_subject(
    subject: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SubjectChapter)
        .where(SubjectChapter.subject == subject)
        .order_by(SubjectChapter.sort_order, SubjectChapter.display_name)
    )
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="No chapters found for this subject")
    return [{"chapter_id": row.chapter_id, "display_name": row.display_name} for row in rows]
