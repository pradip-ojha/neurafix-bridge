from __future__ import annotations

import uuid
from datetime import datetime, UTC

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import r2_client, redis_client
from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.level_note import LevelNote
from app.models.platform_config import PlatformConfig
from app.models.subject_chapter import SubjectChapter
from app.models.subject_timing import SubjectTimingConfig
from app.models.user import User

_TIMING_CACHE_KEY = "timing_config:all"
_TIMING_TTL = 3600  # 1 hour

router = APIRouter(prefix="/api/admin", tags=["admin-content"])

_admin_only = require_role("admin")

_MAIN_SUBJECTS = {
    "compulsory_math",
    "optional_math",
    "compulsory_english",
    "compulsory_science",
}


def _validate_subject(subject: str) -> str:
    key = subject.strip().lower()
    if key not in _MAIN_SUBJECTS:
        raise HTTPException(status_code=400, detail="Invalid main subject")
    return key


def _humanize_slug(value: str) -> str:
    return value.replace("_", " ").strip().title()


def _normalize_topic(topic: dict, index: int) -> dict:
    if not isinstance(topic, dict):
        raise HTTPException(status_code=400, detail=f"topics[{index}] must be an object")
    topic_key = topic.get("topic") or topic.get("id")
    if not topic_key:
        raise HTTPException(status_code=400, detail=f"topics[{index}] requires topic")
    subtopics = topic.get("subtopics", [])
    if subtopics is None:
        subtopics = []
    if not isinstance(subtopics, list):
        raise HTTPException(status_code=400, detail=f"topics[{index}].subtopics must be an array")
    return {"topic": str(topic_key).strip(), "subtopics": subtopics}


def _validate_topics(topics: list[dict]) -> list[dict]:
    if not isinstance(topics, list):
        raise HTTPException(status_code=400, detail="topics must be a JSON array")
    return [_normalize_topic(topic, i) for i, topic in enumerate(topics)]


def _parse_chapter_json(chapter_json: dict) -> tuple[str, list[dict]]:
    if not isinstance(chapter_json, dict):
        raise HTTPException(status_code=400, detail="chapter_json must be an object")
    chapter_id = chapter_json.get("chapter")
    if not chapter_id:
        raise HTTPException(status_code=400, detail="chapter_json requires chapter")
    return str(chapter_id).strip().lower(), _validate_topics(chapter_json.get("topics", []))


def _serialize_chapter(row: SubjectChapter) -> dict:
    return {
        "id": row.id,
        "subject": row.subject,
        "chapter_id": row.chapter_id,
        "display_name": row.display_name,
        "topics": row.topics,
        "sort_order": row.sort_order,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


async def _clear_subject_structure_cache(subject: str, chapter_id: str | None = None) -> None:
    try:
        await redis_client.delete(f"subject_structure:{subject}")
    except Exception:
        pass
    if chapter_id:
        try:
            await redis_client.delete(f"subject_structure:{subject}:{chapter_id}")
        except Exception:
            pass
    try:
        await redis_client.delete(f"subject_chapter_names:{subject}")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Subject Chapters
# ---------------------------------------------------------------------------


class SubjectChapterCreate(BaseModel):
    subject: str
    chapter_json: dict
    display_name: str | None = None
    sort_order: int = 0


class SubjectChapterUpdate(BaseModel):
    subject: str | None = None
    chapter_json: dict | None = None
    display_name: str | None = None
    sort_order: int | None = None


@router.get("/subject-chapters")
async def list_subject_chapters(
    subject: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    subject_key = _validate_subject(subject)
    result = await db.execute(
        select(SubjectChapter)
        .where(SubjectChapter.subject == subject_key)
        .order_by(SubjectChapter.sort_order, SubjectChapter.display_name)
    )
    return [_serialize_chapter(row) for row in result.scalars().all()]


@router.post("/subject-chapters", status_code=status.HTTP_201_CREATED)
async def create_subject_chapter(
    body: SubjectChapterCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    subject_key = _validate_subject(body.subject)
    chapter_id, topics = _parse_chapter_json(body.chapter_json)
    if not chapter_id:
        raise HTTPException(status_code=400, detail="chapter_id is required")

    exists = (await db.execute(
        select(SubjectChapter).where(
            SubjectChapter.subject == subject_key,
            SubjectChapter.chapter_id == chapter_id,
        )
    )).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="Chapter already exists for this subject")

    row = SubjectChapter(
        subject=subject_key,
        chapter_id=chapter_id,
        display_name=(body.display_name or _humanize_slug(chapter_id)).strip(),
        topics=topics,
        sort_order=body.sort_order,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    await _clear_subject_structure_cache(subject_key, chapter_id)
    return _serialize_chapter(row)


async def _get_subject_chapter(
    db: AsyncSession,
    chapter_id: str,
    subject: str | None = None,
) -> SubjectChapter:
    stmt = select(SubjectChapter).where(SubjectChapter.chapter_id == chapter_id)
    if subject:
        stmt = stmt.where(SubjectChapter.subject == _validate_subject(subject))
    result = await db.execute(stmt)
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(status_code=404, detail="Chapter not found")
    if len(rows) > 1:
        raise HTTPException(status_code=400, detail="subject is required for this chapter_id")
    return rows[0]


@router.patch("/subject-chapters/{chapter_id}")
async def update_subject_chapter(
    chapter_id: str,
    body: SubjectChapterUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    row = await _get_subject_chapter(db, chapter_id, body.subject)
    if body.display_name is not None:
        row.display_name = body.display_name.strip()
    if body.chapter_json is not None:
        new_chapter_id, topics = _parse_chapter_json(body.chapter_json)
        if new_chapter_id != row.chapter_id:
            raise HTTPException(status_code=400, detail="chapter in JSON cannot change during edit")
        row.topics = topics
    if body.sort_order is not None:
        row.sort_order = body.sort_order
    row.updated_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(row)
    await _clear_subject_structure_cache(row.subject, row.chapter_id)
    return _serialize_chapter(row)


@router.delete("/subject-chapters/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subject_chapter(
    chapter_id: str,
    subject: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    row = await _get_subject_chapter(db, chapter_id, subject)
    subject_key = row.subject
    await db.delete(row)
    await db.commit()
    await _clear_subject_structure_cache(subject_key, row.chapter_id)


# ---------------------------------------------------------------------------
# Level Notes
# ---------------------------------------------------------------------------


@router.post("/level-notes", status_code=status.HTTP_201_CREATED)
async def upload_level_note(
    subject: str = Form(...),
    chapter: str = Form(...),
    level: int = Form(..., ge=1, le=3),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(_admin_only),
):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")

    display_name = f"{subject} — {chapter} (Level {level})"
    r2_key = f"level-notes/{subject}/{chapter}/level{level}.pdf"

    # Delete old R2 object if it exists (replacing)
    result = await db.execute(
        select(LevelNote).where(
            LevelNote.subject == subject,
            LevelNote.chapter == chapter,
            LevelNote.level == level,
        )
    )
    existing = result.scalar_one_or_none()
    if existing and existing.r2_key:
        r2_client.delete_object(existing.r2_key)

    r2_url = r2_client.upload_bytes(r2_key, data, file.content_type or "application/pdf")

    if existing:
        existing.display_name = display_name
        existing.r2_key = r2_key
        existing.r2_url = r2_url
        existing.uploaded_by = admin.id
        note = existing
    else:
        note = LevelNote(
            subject=subject,
            chapter=chapter,
            level=level,
            display_name=display_name,
            r2_key=r2_key,
            r2_url=r2_url,
            uploaded_by=admin.id,
        )
        db.add(note)

    await db.commit()
    await db.refresh(note)
    return _serialize_note(note)


@router.get("/level-notes")
async def list_level_notes(
    subject: str | None = None,
    chapter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    q = select(LevelNote).order_by(LevelNote.subject, LevelNote.chapter, LevelNote.level)
    if subject:
        q = q.where(LevelNote.subject == subject)
    if chapter:
        q = q.where(LevelNote.chapter == chapter)
    result = await db.execute(q)
    return [_serialize_note(n) for n in result.scalars().all()]


@router.delete("/level-notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_level_note(
    note_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    result = await db.execute(select(LevelNote).where(LevelNote.id == note_id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    if note.r2_key:
        r2_client.delete_object(note.r2_key)

    await db.delete(note)
    await db.commit()


def _serialize_note(n: LevelNote) -> dict:
    return {
        "id": n.id,
        "subject": n.subject,
        "chapter": n.chapter,
        "level": n.level,
        "display_name": n.display_name,
        "r2_url": n.r2_url,
        "uploaded_by": n.uploaded_by,
        "created_at": n.created_at,
    }


# ---------------------------------------------------------------------------
# Subject Timing
# ---------------------------------------------------------------------------

class TimingUpdate(BaseModel):
    seconds_per_question: int


@router.get("/subject-timing")
async def list_subject_timing(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    cached = await redis_client.get_json(_TIMING_CACHE_KEY)
    if cached is not None:
        return cached

    result = await db.execute(
        select(SubjectTimingConfig).order_by(SubjectTimingConfig.subject, SubjectTimingConfig.difficulty)
    )
    rows = [
        {
            "id": r.id,
            "subject": r.subject,
            "difficulty": r.difficulty,
            "seconds_per_question": r.seconds_per_question,
        }
        for r in result.scalars().all()
    ]
    await redis_client.set_json(_TIMING_CACHE_KEY, rows, ex=_TIMING_TTL)
    return rows


@router.patch("/subject-timing/{timing_id}")
async def update_subject_timing(
    timing_id: str,
    body: TimingUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    result = await db.execute(select(SubjectTimingConfig).where(SubjectTimingConfig.id == timing_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Timing config not found")

    row.seconds_per_question = body.seconds_per_question
    await db.commit()
    await db.refresh(row)
    await redis_client.delete(_TIMING_CACHE_KEY)
    return {
        "id": row.id,
        "subject": row.subject,
        "difficulty": row.difficulty,
        "seconds_per_question": row.seconds_per_question,
    }


# ---------------------------------------------------------------------------
# Notifications (placeholder)
# ---------------------------------------------------------------------------

class NotificationBody(BaseModel):
    target: str  # all | paid | free
    title: str
    body: str


@router.post("/notifications/send")
async def send_notification(
    body: NotificationBody,
    _: User = Depends(_admin_only),
):
    if body.target not in ("all", "paid", "free"):
        raise HTTPException(status_code=400, detail="target must be all, paid, or free")
    return {"queued": True, "target": body.target, "title": body.title}


# ---------------------------------------------------------------------------
# Platform Config
# ---------------------------------------------------------------------------

class ConfigUpdate(BaseModel):
    subscription_price: float | None = None
    referral_commission_pct: float | None = None
    referral_discount_pct: float | None = None


@router.get("/config")
async def get_config(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    config = (await db.execute(select(PlatformConfig).where(PlatformConfig.id == 1))).scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    return _serialize_config(config)


@router.patch("/config")
async def update_config(
    body: ConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    config = (await db.execute(select(PlatformConfig).where(PlatformConfig.id == 1))).scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(config, field, value)
    config.updated_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(config)
    return _serialize_config(config)


def _serialize_config(c: PlatformConfig) -> dict:
    return {
        "subscription_price": float(c.subscription_price),
        "referral_commission_pct": float(c.referral_commission_pct),
        "referral_discount_pct": float(c.referral_discount_pct),
        "updated_at": c.updated_at,
    }
