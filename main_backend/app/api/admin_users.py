from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_role
from app.database import get_db
from app.models.student_profile import StudentProfile
from app.models.user import User, UserRole
from app.schemas.auth import UserOut
from app.schemas.student_profile import ProfileOut

router = APIRouter(prefix="/api/admin", tags=["admin"])

_admin_only = require_role("admin")


@router.get("/users")
async def list_users(
    role: str | None = Query(None),
    stream: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    q = select(User)
    if role:
        q = q.where(User.role == UserRole(role))

    if stream:
        q = q.join(StudentProfile, StudentProfile.user_id == User.id).where(
            StudentProfile.stream == stream
        )

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar_one()

    q = q.offset((page - 1) * limit).limit(limit)
    result = await db.execute(q)
    users = result.scalars().all()

    return {
        "items": [UserOut.model_validate(u) for u in users],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.get("/users/{user_id}")
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    sp_result = await db.execute(select(StudentProfile).where(StudentProfile.user_id == user_id))
    sp = sp_result.scalar_one_or_none()

    return {
        "user": UserOut.model_validate(user),
        "student_profile": ProfileOut.model_validate(sp) if sp else None,
    }


@router.patch("/users/{user_id}/deactivate")
async def deactivate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = False
    db.add(user)
    await db.commit()
    return {"message": f"User {user_id} deactivated"}
