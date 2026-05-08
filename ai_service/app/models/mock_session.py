import uuid
from datetime import datetime, date, UTC
from enum import Enum as PyEnum

from sqlalchemy import String, Date, DateTime, Enum, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MockSessionStatus(str, PyEnum):
    active = "active"
    submitted = "submitted"


class MockSession(Base):
    __tablename__ = "mock_sessions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    college_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        Enum(MockSessionStatus, name="mock_session_status_enum"),
        nullable=False,
        default=MockSessionStatus.active,
    )
    question_ids: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    time_limit_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    score_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
