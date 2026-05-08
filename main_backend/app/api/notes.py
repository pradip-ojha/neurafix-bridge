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
from app.models.user import User

router = APIRouter(prefix="/api/notes", tags=["notes"])

_SUBJECT_CHAPTERS: dict[str, list[dict]] = {
    "compulsory_math": [
        {"id": "sets", "display_name": "Sets"},
        {"id": "arithmetic", "display_name": "Arithmetic"},
        {"id": "algebra", "display_name": "Algebra"},
        {"id": "geometry", "display_name": "Geometry"},
        {"id": "trigonometry", "display_name": "Trigonometry"},
        {"id": "statistics", "display_name": "Statistics"},
        {"id": "probability", "display_name": "Probability"},
    ],
    "compulsory_english": [
        {"id": "reading_comprehension", "display_name": "Reading Comprehension"},
        {"id": "grammar", "display_name": "Grammar"},
        {"id": "vocabulary", "display_name": "Vocabulary"},
        {"id": "writing", "display_name": "Writing Skills"},
    ],
    "compulsory_science": [
        {"id": "physics_motion", "display_name": "Physics: Motion and Force"},
        {"id": "physics_energy", "display_name": "Physics: Work, Energy and Power"},
        {"id": "physics_light", "display_name": "Physics: Light"},
        {"id": "physics_electricity", "display_name": "Physics: Electricity and Magnetism"},
        {"id": "chemistry_matter", "display_name": "Chemistry: Matter and Its Properties"},
        {"id": "chemistry_reactions", "display_name": "Chemistry: Chemical Reactions"},
        {"id": "biology_life_processes", "display_name": "Biology: Life Processes"},
        {"id": "biology_heredity", "display_name": "Biology: Heredity and Evolution"},
        {"id": "biology_environment", "display_name": "Biology: Environment and Ecology"},
    ],
    "optional_math": [
        {"id": "coordinate_geometry", "display_name": "Coordinate Geometry"},
        {"id": "trigonometry_advanced", "display_name": "Trigonometry"},
        {"id": "vectors", "display_name": "Vectors"},
        {"id": "matrices", "display_name": "Matrices and Determinants"},
        {"id": "calculus", "display_name": "Calculus"},
        {"id": "probability_advanced", "display_name": "Probability"},
    ],
}

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
    chapters = _SUBJECT_CHAPTERS.get(subject)
    if chapters is None:
        raise HTTPException(status_code=404, detail="Subject not found")

    level = await _get_student_level(str(current_user.id), subject)

    result = await db.execute(
        select(LevelNote).where(LevelNote.subject == subject, LevelNote.level == level)
    )
    uploaded: dict[str, LevelNote] = {n.chapter: n for n in result.scalars().all()}

    items = []
    for ch in chapters:
        note = uploaded.get(ch["id"])
        entry: dict = {
            "chapter_id": ch["id"],
            "display_name": ch["display_name"],
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
    if subject not in _SUBJECT_CHAPTERS:
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
