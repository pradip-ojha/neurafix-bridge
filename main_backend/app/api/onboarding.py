import mimetypes
from datetime import datetime, UTC, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import r2_client
from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.affiliation_profile import AffiliationProfile
from app.models.platform_config import PlatformConfig
from app.models.student_profile import Stream, StudentProfile
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User, UserRole
from app.schemas.affiliation_profile import AffiliationProfileOut
from app.schemas.student_profile import ProfileOut

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

_TRACKED_FIELDS = [
    "stream", "school_name", "see_gpa",
    "class_8_scores", "class_9_scores", "class_10_scores",
    "marksheet_urls",
]


def _compute_completion(profile: StudentProfile) -> int:
    filled = sum(1 for f in _TRACKED_FIELDS if getattr(profile, f) is not None)
    return round(filled / len(_TRACKED_FIELDS) * 100)


class SetRoleBody(BaseModel):
    role: str


class SetStreamBody(BaseModel):
    stream: str
    school_name: str
    school_address: str | None = None


@router.post("/set-role")
async def set_role(
    body: SetRoleBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.role not in ("student", "affiliation_partner"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")

    current_user.role = UserRole(body.role)
    db.add(current_user)
    await db.commit()

    redirect_to = "/onboarding/student" if body.role == "student" else "/onboarding/affiliation"
    return {"message": "Role updated", "redirect_to": redirect_to}


@router.post("/student/set-stream")
async def student_set_stream(
    body: SetStreamBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.stream not in ("science", "management"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid stream")

    existing = await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
    profile = existing.scalar_one_or_none()

    if profile:
        profile.stream = Stream(body.stream)
        profile.school_name = body.school_name
        profile.school_address = body.school_address
    else:
        profile = StudentProfile(
            user_id=current_user.id,
            stream=Stream(body.stream),
            school_name=body.school_name,
            school_address=body.school_address,
        )
        db.add(profile)

    await db.flush()
    profile.profile_completion_pct = _compute_completion(profile)
    current_user.onboarding_complete = True
    db.add(current_user)

    # Auto-create trial subscription if one doesn't exist yet
    existing_sub = (
        await db.execute(select(Subscription).where(Subscription.user_id == current_user.id))
    ).scalar_one_or_none()
    if not existing_sub:
        config = (
            await db.execute(select(PlatformConfig).where(PlatformConfig.id == 1))
        ).scalar_one_or_none()
        trial_days = config.trial_duration_days if config else 7
        now = datetime.now(UTC)
        db.add(Subscription(
            user_id=current_user.id,
            status=SubscriptionStatus.trial,
            trial_ends_at=now + timedelta(days=trial_days),
            updated_at=now,
        ))

    await db.commit()
    await db.refresh(profile)

    return {"message": "Onboarding complete", "profile": ProfileOut.model_validate(profile)}


@router.post("/affiliation/setup")
async def affiliation_setup(
    bank_name: str | None = Form(None),
    account_number: str | None = Form(None),
    account_name: str | None = Form(None),
    qr_image: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.affiliation_partner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not an affiliation account")

    qr_url: str | None = None
    if qr_image and qr_image.filename:
        ext = mimetypes.guess_extension(qr_image.content_type or "") or ".png"
        key = f"affiliates/{current_user.id}/qr{ext}"
        data = await qr_image.read()
        qr_url = r2_client.upload_bytes(key, data, qr_image.content_type or "image/png")

    existing = await db.execute(
        select(AffiliationProfile).where(AffiliationProfile.user_id == current_user.id)
    )
    aff = existing.scalar_one_or_none()

    if aff:
        aff.bank_name = bank_name
        aff.account_number = account_number
        aff.account_name = account_name
        if qr_url:
            aff.qr_image_url = qr_url
    else:
        aff = AffiliationProfile(
            user_id=current_user.id,
            bank_name=bank_name,
            account_number=account_number,
            account_name=account_name,
            qr_image_url=qr_url,
        )
        db.add(aff)

    current_user.onboarding_complete = True
    db.add(current_user)
    await db.commit()
    await db.refresh(aff)

    return {"message": "Affiliation setup complete", "profile": AffiliationProfileOut.model_validate(aff)}
