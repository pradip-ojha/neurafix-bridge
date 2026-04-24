from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import verify_internal_secret
from app.database import get_db
from app.models.student_profile import StudentProfile
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
