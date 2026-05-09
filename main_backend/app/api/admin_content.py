from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import r2_client, redis_client
from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.level_note import LevelNote
from app.models.subject_timing import SubjectTimingConfig
from app.models.user import User

_TIMING_CACHE_KEY = "timing_config:all"
_TIMING_TTL = 3600  # 1 hour

router = APIRouter(prefix="/api/admin", tags=["admin-content"])

_admin_only = require_role("admin")


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
    target: str  # all | paid | trial
    title: str
    body: str


@router.post("/notifications/send")
async def send_notification(
    body: NotificationBody,
    _: User = Depends(_admin_only),
):
    if body.target not in ("all", "paid", "trial"):
        raise HTTPException(status_code=400, detail="target must be all, paid, or trial")
    return {"queued": True, "target": body.target, "title": body.title}


# ---------------------------------------------------------------------------
# Platform Config
# ---------------------------------------------------------------------------

from app.models.platform_config import PlatformConfig
from datetime import datetime, UTC


class ConfigUpdate(BaseModel):
    subscription_price: float | None = None
    trial_duration_days: int | None = None
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
        "trial_duration_days": c.trial_duration_days,
        "referral_commission_pct": float(c.referral_commission_pct),
        "referral_discount_pct": float(c.referral_discount_pct),
        "updated_at": c.updated_at,
    }
