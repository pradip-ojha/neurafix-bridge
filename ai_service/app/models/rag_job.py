import uuid
from datetime import datetime, UTC
from enum import Enum as PyEnum

from sqlalchemy import String, Text, Integer, DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RagJobStatus(str, PyEnum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class RagJob(Base):
    __tablename__ = "rag_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    book_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    book_title: Mapped[str] = mapped_column(String(500), nullable=False)
    subject: Mapped[str] = mapped_column(String(100), nullable=False)
    class_level: Mapped[str] = mapped_column(String(20), nullable=False, default="10")
    stream: Mapped[str] = mapped_column(String(50), nullable=False)
    book_type: Mapped[str] = mapped_column(String(50), nullable=False)
    publisher: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum(RagJobStatus, name="rag_job_status"),
        nullable=False,
        default=RagJobStatus.queued,
    )
    total_chunks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    book_file_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    book_file_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
