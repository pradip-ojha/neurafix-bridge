import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Stream(str, enum.Enum):
    science = "science"
    management = "management"


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    stream: Mapped[str | None] = mapped_column(
        Enum(Stream, name="stream"), nullable=True
    )
    school_name: Mapped[str | None] = mapped_column(String, nullable=True)
    school_address: Mapped[str | None] = mapped_column(String, nullable=True)
    class_8_scores: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    class_9_scores: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    class_10_scores: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    see_gpa: Mapped[float | None] = mapped_column(Float, nullable=True)
    marksheet_urls: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    profile_completion_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, onupdate=func.now())

    user: Mapped["User"] = relationship("User", back_populates="student_profile")  # noqa: F821
