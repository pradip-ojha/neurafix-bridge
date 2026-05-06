from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LevelNote(Base):
    __tablename__ = "level_notes"
    __table_args__ = (UniqueConstraint("subject", "chapter", "level", name="uq_level_note"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, server_default="gen_random_uuid()")
    subject: Mapped[str] = mapped_column(String(100), nullable=False)
    chapter: Mapped[str] = mapped_column(String(255), nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    display_name: Mapped[str] = mapped_column(String(500), nullable=False)
    r2_key: Mapped[str] = mapped_column(String(500), nullable=False)
    r2_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    uploaded_by: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
