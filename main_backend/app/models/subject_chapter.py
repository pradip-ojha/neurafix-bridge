from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SubjectChapter(Base):
    __tablename__ = "subject_chapters"
    __table_args__ = (UniqueConstraint("subject", "chapter_id", name="uq_subject_chapter"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, server_default="gen_random_uuid()")
    subject: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    chapter_id: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(500), nullable=False)
    topics: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
