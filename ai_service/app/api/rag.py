"""
RAG pipeline API endpoints.
All endpoints require X-Internal-Secret header.

Accepted file types:
  .pdf   — digital/text PDF (uses PyMuPDF text extraction)
  .docx  — Word document (uses python-docx; handles converted image PDFs)

Original files are stored in R2 at:
  books/{book_id}/original/{filename}
so students can download/view the source book later.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, UTC

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.rag_job import RagJob, RagJobStatus
from app.r2_client import delete_prefix, upload_bytes
from app.rag.embedder import delete_book_vectors
from app.rag.pipeline import run_pipeline
from app.rag.schemas import BookUploadRequest, JobStatus
from app.redis_client import get_json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/rag", tags=["rag"])

_ALLOWED_EXTENSIONS = (".pdf", ".docx")

_CONTENT_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def require_internal_secret(x_internal_secret: str = Header(...)) -> None:
    if x_internal_secret != settings.MAIN_BACKEND_INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")


@router.post("/upload-book", status_code=status.HTTP_202_ACCEPTED)
async def upload_book(
    book_id: str = Form(...),
    book_title: str = Form(...),
    subject: str = Form(...),
    class_level: str = Form("10"),
    stream: str = Form(...),
    book_type: str = Form(...),
    publisher: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_secret),
):
    """
    Accept a .pdf or .docx file, store the original in R2, create a RagJob,
    and start the RAG pipeline in the background. Returns immediately with job_id.
    """
    filename = (file.filename or "upload").lower()
    file_ext = None
    for ext in _ALLOWED_EXTENSIONS:
        if filename.endswith(ext):
            file_ext = ext.lstrip(".")
            break

    if file_ext is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(_ALLOWED_EXTENSIONS)}",
        )

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # Store original file in R2 so students can view/download it later
    original_filename = file.filename or f"book.{file_ext}"
    r2_key = f"books/{book_id}/original/{original_filename}"
    content_type = _CONTENT_TYPES[file_ext]
    book_file_url = upload_bytes(r2_key, file_bytes, content_type)

    request = BookUploadRequest(
        book_id=book_id,
        book_title=book_title,
        subject=subject,
        class_level=class_level,
        stream=stream,
        book_type=book_type,
        publisher=publisher,
    )

    job = RagJob(
        book_id=book_id,
        book_title=book_title,
        subject=subject,
        class_level=class_level,
        stream=stream,
        book_type=book_type,
        publisher=publisher,
        status=RagJobStatus.queued,
        book_file_url=book_file_url,
        book_file_key=r2_key,
        created_at=datetime.now(UTC),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    asyncio.create_task(run_pipeline(job.id, file_bytes, file_ext, request))

    logger.warning(
        "RAG job %s created for book_id=%s file_type=%s file_url=%s",
        job.id, book_id, file_ext, book_file_url,
    )
    return {
        "job_id": job.id,
        "status": "queued",
        "file_type": file_ext,
        "book_file_url": book_file_url,
    }


@router.get("/status/{job_id}", response_model=JobStatus)
async def get_job_status(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_secret),
):
    """Get pipeline progress. Reads from Redis first, falls back to DB."""
    redis_data = await get_json(f"rag:job:{job_id}")
    job = await db.get(RagJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if redis_data:
        return JobStatus(
            job_id=job_id,
            status=redis_data.get("status", "unknown"),
            stage=redis_data.get("stage", "unknown"),
            progress_pct=redis_data.get("progress_pct", 0),
            message=redis_data.get("message", ""),
            total_chunks=job.total_chunks,
            error_message=job.error_message,
        )

    return JobStatus(
        job_id=job_id,
        status=job.status,
        stage=job.status,
        progress_pct=100 if job.status == "completed" else 0,
        message="",
        total_chunks=job.total_chunks,
        error_message=job.error_message,
    )


@router.get("/books")
async def list_books(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_secret),
):
    """List all books ordered by created_at desc. Includes book_file_url for student access."""
    result = await db.execute(select(RagJob).order_by(RagJob.created_at.desc()))
    jobs = result.scalars().all()
    return [
        {
            "job_id": j.id,
            "book_id": j.book_id,
            "book_title": j.book_title,
            "subject": j.subject,
            "stream": j.stream,
            "book_type": j.book_type,
            "publisher": j.publisher,
            "class_level": j.class_level,
            "status": j.status,
            "total_chunks": j.total_chunks,
            "book_file_url": j.book_file_url,
            "error_message": j.error_message,
            "created_at": j.created_at,
            "completed_at": j.completed_at,
        }
        for j in jobs
    ]


@router.delete("/books/{book_id}")
async def delete_book(
    book_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_secret),
):
    """
    Delete a book: removes Pinecone vectors, original file from R2, and DB record.
    """
    result = await db.execute(select(RagJob).where(RagJob.book_id == book_id))
    jobs = result.scalars().all()
    if not jobs:
        raise HTTPException(status_code=404, detail="Book not found")

    # Delete Pinecone vectors (all vectors share the same book_id filter)
    await delete_book_vectors(book_id)

    # Delete ALL R2 objects for this book (original file + all extracted images)
    try:
        r2_deleted = delete_prefix(f"books/{book_id}/")
        logger.warning("Deleted %d R2 objects for book_id=%s", r2_deleted, book_id)
    except Exception as exc:
        logger.warning("R2 cleanup failed for book_id=%s: %s", book_id, exc)
        r2_deleted = 0

    for job in jobs:
        await db.delete(job)
    await db.commit()

    return {"message": "deleted", "book_id": book_id, "r2_files_deleted": r2_deleted}
