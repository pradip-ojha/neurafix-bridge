import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core import r2_client
from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.student_profile import StudentProfile
from app.models.user import User
from app.schemas.student_profile import ProfileOut, ProfileUpdate

router = APIRouter(tags=["profile"])

_TRACKED_FIELDS = [
    "stream", "school_name", "see_gpa",
    "class_8_scores", "class_9_scores", "class_10_scores",
    "marksheet_urls",
]


def _compute_completion(profile: StudentProfile) -> int:
    filled = sum(1 for f in _TRACKED_FIELDS if getattr(profile, f) is not None)
    return round(filled / len(_TRACKED_FIELDS) * 100)


@router.get("/api/profile/student", response_model=ProfileOut)
async def get_student_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return ProfileOut.model_validate(profile)


@router.patch("/api/profile/student", response_model=ProfileOut)
async def update_student_profile(
    body: ProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)

    profile.profile_completion_pct = _compute_completion(profile)
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return ProfileOut.model_validate(profile)


@router.post("/api/profile/student/upload-marksheet")
async def upload_marksheet(
    year: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    ext = os.path.splitext(file.filename or "file")[1] or ".pdf"
    key = f"students/{current_user.id}/marksheets/{year}_{file.filename}"
    data = await file.read()
    url = r2_client.upload_bytes(key, data, file.content_type or "application/octet-stream")

    current_urls: list = profile.marksheet_urls or []
    current_urls = [e for e in current_urls if e.get("year") != year]
    current_urls.append({"year": year, "url": url})
    profile.marksheet_urls = current_urls
    profile.profile_completion_pct = _compute_completion(profile)

    db.add(profile)
    await db.commit()

    return {"url": url, "year": year}


@router.get("/api/users/me/referral-code")
async def get_referral_code(current_user: User = Depends(get_current_user)):
    base_url = "https://hamroguru.app"
    return {
        "referral_code": current_user.referral_code,
        "referral_link": f"{base_url}/register?ref={current_user.referral_code}",
    }
