import uuid
from datetime import datetime, date, UTC
from enum import Enum as PyEnum

from sqlalchemy import String, Text, Integer, Date, DateTime, Enum, JSON, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AgentType(str, PyEnum):
    tutor = "tutor"
    capsule = "capsule"
    practice = "practice"
    planner = "planner"
    consultant = "consultant"
    personalization = "personalization"


class SummaryType(str, PyEnum):
    all_time = "all_time"
    weekly = "weekly"
    daily = "daily"


class OverallStudentSummary(Base):
    __tablename__ = "overall_student_summaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    covers_through: Mapped[date] = mapped_column(Date, nullable=False)


class SubjectSummary(Base):
    __tablename__ = "subject_summaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(100), nullable=False)
    summary_type: Mapped[str] = mapped_column(Enum(SummaryType, name="summary_type_enum"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    summary_date: Mapped[date | None] = mapped_column(Date, nullable=True)


class SessionMemory(Base):
    __tablename__ = "session_memories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    subject: Mapped[str | None] = mapped_column(String(100), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    message_count_at_generation: Mapped[int] = mapped_column(Integer, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class ConsultantTimeline(Base):
    __tablename__ = "consultant_timelines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    last_updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class PracticeSessionSummary(Base):
    __tablename__ = "practice_session_summaries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(100), nullable=False)
    chapter: Mapped[str] = mapped_column(String(200), nullable=False)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    correct_count: Mapped[int] = mapped_column(Integer, nullable=False)
    incorrect_count: Mapped[int] = mapped_column(Integer, nullable=False)
    topic_breakdown: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    summary_content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class StudentLevel(Base):
    __tablename__ = "student_levels"
    __table_args__ = (
        CheckConstraint("level IN (1, 2, 3)", name="ck_student_level_valid"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(100), nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class DailyCapsule(Base):
    __tablename__ = "daily_capsules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    subject: Mapped[str] = mapped_column(String(100), nullable=False)
    capsule_date: Mapped[date] = mapped_column(Date, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
