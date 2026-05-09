import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core import r2_client
from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.affiliation_profile import AffiliationProfile
from app.models.student_profile import StudentProfile
from app.models.user import User
from app.schemas.student_profile import ProfileOut, ProfileUpdate

router = APIRouter(tags=["profile"])

_affiliation_only = require_role("affiliation_partner")

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
    out = ProfileOut.model_validate(profile)
    out.full_name = current_user.full_name
    return out


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

    data = body.model_dump(exclude_unset=True)

    if "full_name" in data:
        current_user.full_name = data.pop("full_name")
        db.add(current_user)

    for field, value in data.items():
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


@router.get("/api/profile/affiliation")
async def get_affiliation_profile(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_affiliation_only),
):
    result = await db.execute(select(AffiliationProfile).where(AffiliationProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Affiliation profile not found")
    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "bank_name": profile.bank_name,
        "account_number": profile.account_number,
        "account_name": profile.account_name,
        "qr_image_url": profile.qr_image_url,
        "total_referrals": profile.total_referrals,
        "total_earnings": float(profile.total_earnings),
        "created_at": profile.created_at,
    }


@router.patch("/api/profile/affiliation")
async def update_affiliation_profile(
    bank_name: str | None = Form(None),
    account_number: str | None = Form(None),
    account_name: str | None = Form(None),
    qr_image: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_affiliation_only),
):
    result = await db.execute(select(AffiliationProfile).where(AffiliationProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Affiliation profile not found")

    if bank_name is not None:
        profile.bank_name = bank_name
    if account_number is not None:
        profile.account_number = account_number
    if account_name is not None:
        profile.account_name = account_name

    if qr_image and qr_image.filename:
        data = await qr_image.read()
        if data:
            ext = os.path.splitext(qr_image.filename)[1] or ".png"
            key = f"affiliation-qr/{current_user.id}/qr{ext}"
            url = r2_client.upload_bytes(key, data, qr_image.content_type or "image/png")
            profile.qr_image_url = url

    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    return {
        "id": profile.id,
        "bank_name": profile.bank_name,
        "account_number": profile.account_number,
        "account_name": profile.account_name,
        "qr_image_url": profile.qr_image_url,
        "total_referrals": profile.total_referrals,
        "total_earnings": float(profile.total_earnings),
    }
