"""
Admin endpoints for homepage FAQ and demo video management.

GET    /api/admin/faqs          → list all FAQs
POST   /api/admin/faqs          → create FAQ
PUT    /api/admin/faqs/{id}     → update FAQ
DELETE /api/admin/faqs/{id}     → delete FAQ
PATCH  /api/admin/homepage      → update demo video URL
"""
from __future__ import annotations

from datetime import datetime, UTC

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_role
from app.database import get_db
from app.models.homepage_faq import HomepageFAQ
from app.models.platform_config import PlatformConfig
from app.models.user import User

router = APIRouter(prefix="/api/admin", tags=["admin-homepage"])

_admin_only = require_role("admin")


class FAQCreate(BaseModel):
    question: str
    answer: str
    display_order: int = 0
    is_active: bool = True


class FAQUpdate(BaseModel):
    question: str
    answer: str
    display_order: int = 0
    is_active: bool = True


class HomepageUpdate(BaseModel):
    demo_video_url: str | None = None


@router.get("/faqs")
async def list_faqs(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    result = await db.execute(
        select(HomepageFAQ).order_by(HomepageFAQ.display_order.asc(), HomepageFAQ.id.asc())
    )
    faqs = result.scalars().all()
    return [
        {
            "id": f.id,
            "question": f.question,
            "answer": f.answer,
            "display_order": f.display_order,
            "is_active": f.is_active,
            "created_at": f.created_at.isoformat(),
        }
        for f in faqs
    ]


@router.post("/faqs", status_code=status.HTTP_201_CREATED)
async def create_faq(
    body: FAQCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    faq = HomepageFAQ(
        question=body.question,
        answer=body.answer,
        display_order=body.display_order,
        is_active=body.is_active,
    )
    db.add(faq)
    await db.commit()
    await db.refresh(faq)
    return {"id": faq.id, "question": faq.question, "answer": faq.answer,
            "display_order": faq.display_order, "is_active": faq.is_active}


@router.put("/faqs/{faq_id}")
async def update_faq(
    faq_id: int,
    body: FAQUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    result = await db.execute(select(HomepageFAQ).where(HomepageFAQ.id == faq_id))
    faq = result.scalar_one_or_none()
    if not faq:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")

    faq.question = body.question
    faq.answer = body.answer
    faq.display_order = body.display_order
    faq.is_active = body.is_active
    await db.commit()
    return {"id": faq.id, "question": faq.question, "answer": faq.answer,
            "display_order": faq.display_order, "is_active": faq.is_active}


@router.delete("/faqs/{faq_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_faq(
    faq_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    result = await db.execute(select(HomepageFAQ).where(HomepageFAQ.id == faq_id))
    faq = result.scalar_one_or_none()
    if not faq:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ not found")
    await db.delete(faq)
    await db.commit()


@router.patch("/homepage")
async def update_homepage_config(
    body: HomepageUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    result = await db.execute(select(PlatformConfig).where(PlatformConfig.id == 1))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Platform config not found")

    config.demo_video_url = body.demo_video_url
    config.updated_at = datetime.now(UTC)
    await db.commit()
    return {"demo_video_url": config.demo_video_url}
