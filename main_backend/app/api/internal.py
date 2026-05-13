from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import verify_internal_secret
from app.database import get_db
from app.models.admin_notification import AdminNotification
from app.models.college import College
from app.models.student_profile import StudentProfile
from app.models.subject_chapter import SubjectChapter
from app.models.subscription import Subscription, SubscriptionStatus
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
        sub = Subscription(user_id=user_id, status=SubscriptionStatus.free, trial_ends_at=None)
        db.add(sub)
        await db.commit()
        await db.refresh(sub)
    return {
        "status": sub.status,
        "trial_ends_at": sub.trial_ends_at,
        "subscription_ends_at": sub.subscription_ends_at,
    }


@router.get("/subject-structure/{subject}/chapters/{chapter_id}", dependencies=[Depends(verify_internal_secret)])
async def get_internal_chapter_structure(
    subject: str,
    chapter_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SubjectChapter).where(
            SubjectChapter.subject == subject,
            SubjectChapter.chapter_id == chapter_id,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapter structure not found")
    return {
        "subject": row.subject,
        "chapter": row.chapter_id,
        "display_name": row.display_name,
        "topics": row.topics,
    }


@router.get("/subject-structure/{subject}/chapter-names", dependencies=[Depends(verify_internal_secret)])
async def get_internal_subject_chapter_names(subject: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SubjectChapter)
        .where(SubjectChapter.subject == subject)
        .order_by(SubjectChapter.sort_order, SubjectChapter.display_name)
    )
    return [
        {"chapter_id": row.chapter_id, "display_name": row.display_name}
        for row in result.scalars().all()
    ]


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
        "class_level_distribution": college.class_level_distribution,
        "is_active": college.is_active,
    }
