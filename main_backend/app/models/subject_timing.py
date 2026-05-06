from __future__ import annotations

from sqlalchemy import Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SubjectTimingConfig(Base):
    __tablename__ = "subject_timing_config"
    __table_args__ = (UniqueConstraint("subject", "difficulty", name="uq_subject_difficulty"),)

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, server_default="gen_random_uuid()")
    subject: Mapped[str] = mapped_column(String(100), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(10), nullable=False)
    seconds_per_question: Mapped[int] = mapped_column(Integer, nullable=False, default=72)
