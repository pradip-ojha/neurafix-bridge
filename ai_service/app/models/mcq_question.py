import uuid
from datetime import datetime, UTC
from enum import Enum as PyEnum

from sqlalchemy import String, Boolean, Integer, DateTime, Enum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class DifficultyEnum(str, PyEnum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class MainQuestion(Base):
    __tablename__ = "main_questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    question_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    subject: Mapped[str] = mapped_column(String(100), nullable=False)
    chapter: Mapped[str] = mapped_column(String(255), nullable=False)
    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    subtopic: Mapped[str | None] = mapped_column(String(255), nullable=True)
    difficulty: Mapped[str] = mapped_column(
        Enum(DifficultyEnum, name="difficulty_enum"),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)


class ExtraQuestion(Base):
    __tablename__ = "extra_questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    question_id: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    subject: Mapped[str] = mapped_column(String(100), nullable=False)
    difficulty: Mapped[str] = mapped_column(
        Enum(DifficultyEnum, name="difficulty_enum", create_type=False),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)


class ExtraSubject(Base):
    __tablename__ = "extra_subjects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    subject_key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
