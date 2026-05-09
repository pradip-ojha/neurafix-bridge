from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import verify_internal_secret
from app.database import get_db
from app.models.admin_notification import AdminNotification
from app.models.college import College
from app.models.student_profile import StudentProfile
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.auth import UserOut
from app.schemas.student_profile import ProfileOut

router = APIRouter(prefix="/api/internal", tags=["internal"])


@router.get("/profile/{user_id}", dependencies=[Depends(verify_internal_secret)])
async def get_internal_profile(user_id: str, db: AsyncSession = Depends(get_db)):
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


@router.get("/subscription/{user_id}", dependencies=[Depends(verify_internal_secret)])
async def get_internal_subscription(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subscription).where(Subscription.user_id == user_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")
    return {
        "status": sub.status,
        "trial_ends_at": sub.trial_ends_at,
        "subscription_ends_at": sub.subscription_ends_at,
    }


class AdminNotifyBody(BaseModel):
    type: str
    payload: dict = {}


@router.post("/admin-notify", dependencies=[Depends(verify_internal_secret)])
async def admin_notify(body: AdminNotifyBody, db: AsyncSession = Depends(get_db)):
    """Worker calls this to log batch failure alerts visible to admin."""
    notif = AdminNotification(type=body.type, payload=body.payload)
    db.add(notif)
    await db.commit()
    return {"status": "ok"}


@router.get("/colleges/{college_id}", dependencies=[Depends(verify_internal_secret)])
async def get_internal_college(college_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(College).where(College.id == college_id))
    college = result.scalar_one_or_none()
    if not college:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="College not found")
    return {
        "id": college.id,
        "name": college.name,
        "location": college.location,
        "total_questions": college.total_questions,
        "total_time_minutes": college.total_time_minutes,
        "question_distribution": college.question_distribution,
        "is_active": college.is_active,
    }
