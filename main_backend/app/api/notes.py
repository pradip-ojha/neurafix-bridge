from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core import r2_client
from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.level_note import LevelNote
from app.models.subject_chapter import SubjectChapter
from app.models.user import User

router = APIRouter(prefix="/api/notes", tags=["notes"])

_LEVEL_LABELS = {1: "Advanced", 2: "Average", 3: "Foundation"}
_DEFAULT_LEVEL = 2


async def _get_student_level(user_id: str, subject: str) -> int:
    url = f"{settings.AI_SERVICE_URL}/api/internal/student-level/{user_id}"
    headers = {"X-Internal-Secret": settings.MAIN_BACKEND_INTERNAL_SECRET}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers=headers, params={"subject": subject})
            if resp.status_code == 200:
                data = resp.json()
                return data.get("level") or _DEFAULT_LEVEL
    except Exception:
        pass
    return _DEFAULT_LEVEL


@router.get("/{subject}")
async def list_chapter_notes(
    subject: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ch_result = await db.execute(
        select(SubjectChapter)
        .where(SubjectChapter.subject == subject)
        .order_by(SubjectChapter.sort_order, SubjectChapter.display_name)
    )
    chapter_rows = ch_result.scalars().all()
    if not chapter_rows:
        raise HTTPException(status_code=404, detail="Subject not found or no chapters configured")

    level = await _get_student_level(str(current_user.id), subject)

    note_result = await db.execute(
        select(LevelNote).where(LevelNote.subject == subject, LevelNote.level == level)
    )
    uploaded: dict[str, LevelNote] = {n.chapter: n for n in note_result.scalars().all()}

    items = []
    for row in chapter_rows:
        note = uploaded.get(row.chapter_id)
        entry: dict = {
            "chapter_id": row.chapter_id,
            "display_name": row.display_name,
            "has_note": note is not None,
            "level": level,
            "level_label": _LEVEL_LABELS.get(level, "Average"),
        }
        if note:
            entry["url"] = r2_client.get_presigned_url(note.r2_key, expires_in=3600)
        items.append(entry)

    return {"level": level, "level_label": _LEVEL_LABELS.get(level, "Average"), "chapters": items}


@router.get("/{subject}/{chapter}")
async def get_chapter_note(
    subject: str,
    chapter: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    subject_exists = await db.execute(
        select(SubjectChapter).where(SubjectChapter.subject == subject).limit(1)
    )
    if not subject_exists.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Subject not found")

    level = await _get_student_level(str(current_user.id), subject)

    result = await db.execute(
        select(LevelNote).where(
            LevelNote.subject == subject,
            LevelNote.chapter == chapter,
            LevelNote.level == level,
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not available for this chapter")

    return {
        "chapter_id": chapter,
        "display_name": note.display_name,
        "url": r2_client.get_presigned_url(note.r2_key, expires_in=3600),
        "level": level,
        "level_label": _LEVEL_LABELS.get(level, "Average"),
    }
