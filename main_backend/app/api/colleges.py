from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.college import College
from app.models.user import User

router = APIRouter(tags=["colleges"])

_admin_only = require_role("admin")


class CollegeIn(BaseModel):
    name: str
    location: str | None = None
    total_questions: int
    total_time_minutes: int
    question_distribution: dict[str, int] = {}


class CollegeUpdate(BaseModel):
    name: str | None = None
    location: str | None = None
    total_questions: int | None = None
    total_time_minutes: int | None = None
    question_distribution: dict[str, int] | None = None
    is_active: bool | None = None


def _serialize(c: College) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "location": c.location,
        "total_questions": c.total_questions,
        "total_time_minutes": c.total_time_minutes,
        "question_distribution": c.question_distribution,
        "is_active": c.is_active,
        "created_at": c.created_at,
    }


@router.get("/api/colleges")
async def list_colleges_public(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(College).where(College.is_active == True).order_by(College.name))
    return [_serialize(c) for c in result.scalars().all()]


@router.post("/api/admin/colleges", status_code=status.HTTP_201_CREATED)
async def create_college(
    body: CollegeIn,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    college = College(**body.model_dump())
    db.add(college)
    await db.commit()
    await db.refresh(college)
    return _serialize(college)


@router.get("/api/admin/colleges")
async def list_colleges_admin(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    result = await db.execute(select(College).order_by(College.name))
    return [_serialize(c) for c in result.scalars().all()]


@router.patch("/api/admin/colleges/{college_id}")
async def update_college(
    college_id: str,
    body: CollegeUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    result = await db.execute(select(College).where(College.id == college_id))
    college = result.scalar_one_or_none()
    if not college:
        raise HTTPException(status_code=404, detail="College not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(college, field, value)

    await db.commit()
    await db.refresh(college)
    return _serialize(college)
