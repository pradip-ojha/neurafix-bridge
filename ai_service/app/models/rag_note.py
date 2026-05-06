import uuid
from datetime import datetime, UTC
from enum import Enum as PyEnum

from sqlalchemy import String, Text, Integer, DateTime, Enum
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RagNoteStatus(str, PyEnum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class RagNote(Base):
    __tablename__ = "rag_notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    note_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    subject: Mapped[str] = mapped_column(String(100), nullable=False)
    chapter: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    display_name: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum(RagNoteStatus, name="rag_note_status"),
        nullable=False,
        default=RagNoteStatus.queued,
    )
    total_chunks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    r2_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    r2_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
