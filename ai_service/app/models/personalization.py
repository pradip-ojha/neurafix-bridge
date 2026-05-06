import uuid
from datetime import datetime, UTC
from enum import Enum as PyEnum

from sqlalchemy import String, Text, Integer, DateTime, Enum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AgentType(str, PyEnum):
    tutor = "tutor"
    capsule = "capsule"
    practice = "practice"
    planner = "planner"


class TimelineType(str, PyEnum):
    daily = "daily"
    weekly = "weekly"
    fifteen_day = "fifteen_day"
    monthly = "monthly"
    all_time = "all_time"


class PersonalizationSummary(Base):
    __tablename__ = "personalization_summaries"
    __table_args__ = (
        UniqueConstraint("user_id", "agent_type", "subject", "timeline", name="uq_summary_per_timeline"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    agent_type: Mapped[str] = mapped_column(Enum(AgentType, name="agent_type_enum"), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(100), nullable=True)
    timeline: Mapped[str] = mapped_column(Enum(TimelineType, name="timeline_type_enum"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    covers_period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    covers_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PlannerTimeline(Base):
    __tablename__ = "planner_timelines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    last_updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    next_review_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
