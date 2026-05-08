"""
College document endpoints: syllabi and past question papers.

GET  /api/colleges/{id}/syllabus              JWT(any)
GET  /api/colleges/{id}/past-questions        JWT(any)
POST /api/admin/colleges/{id}/syllabus        JWT(admin), multipart
POST /api/admin/colleges/{id}/past-questions  JWT(admin), multipart
"""
from __future__ import annotations

import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import r2_client
from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models.college import College
from app.models.college_content import CollegeSyllabus, PastQuestionPaper
from app.models.user import User

router = APIRouter(tags=["college-content"])

_admin_only = require_role("admin")


def _syllabus_out(s: CollegeSyllabus) -> dict:
    return {
        "id": s.id,
        "college_id": s.college_id,
        "year": s.year,
        "display_name": s.display_name,
        "file_url": s.file_url,
        "created_at": s.created_at,
    }


def _paper_out(p: PastQuestionPaper) -> dict:
    return {
        "id": p.id,
        "college_id": p.college_id,
        "year": p.year,
        "file_url": p.file_url,
        "created_at": p.created_at,
    }


async def _get_college_or_404(college_id: str, db: AsyncSession) -> College:
    result = await db.execute(select(College).where(College.id == college_id))
    college = result.scalar_one_or_none()
    if not college:
        raise HTTPException(status_code=404, detail="College not found")
    return college


@router.get("/api/colleges/{college_id}/syllabus")
async def list_syllabi(
    college_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    await _get_college_or_404(college_id, db)
    result = await db.execute(
        select(CollegeSyllabus).where(CollegeSyllabus.college_id == college_id).order_by(CollegeSyllabus.year.desc())
    )
    return [_syllabus_out(s) for s in result.scalars().all()]


@router.get("/api/colleges/{college_id}/past-questions")
async def list_past_papers(
    college_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    await _get_college_or_404(college_id, db)
    result = await db.execute(
        select(PastQuestionPaper).where(PastQuestionPaper.college_id == college_id).order_by(PastQuestionPaper.year.desc())
    )
    return [_paper_out(p) for p in result.scalars().all()]


@router.post("/api/admin/colleges/{college_id}/syllabus", status_code=status.HTTP_201_CREATED)
async def upload_syllabus(
    college_id: str,
    year: int = Form(...),
    display_name: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    await _get_college_or_404(college_id, db)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")

    ext = os.path.splitext(file.filename or "file")[1] or ".pdf"
    key = f"college-docs/{college_id}/syllabus/{year}/{file.filename or f'syllabus{ext}'}"
    url = r2_client.upload_bytes(key, data, file.content_type or "application/pdf")

    record = CollegeSyllabus(
        college_id=college_id,
        year=year,
        display_name=display_name,
        file_url=url,
        file_key=key,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return _syllabus_out(record)


@router.post("/api/admin/colleges/{college_id}/past-questions", status_code=status.HTTP_201_CREATED)
async def upload_past_paper(
    college_id: str,
    year: int = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    await _get_college_or_404(college_id, db)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")

    ext = os.path.splitext(file.filename or "file")[1] or ".pdf"
    key = f"college-docs/{college_id}/past-questions/{year}/{file.filename or f'paper{ext}'}"
    url = r2_client.upload_bytes(key, data, file.content_type or "application/pdf")

    record = PastQuestionPaper(
        college_id=college_id,
        year=year,
        file_url=url,
        file_key=key,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return _paper_out(record)
