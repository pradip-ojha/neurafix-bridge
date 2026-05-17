from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy import DateTime, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PlatformConfig(Base):
    __tablename__ = "platform_config"

    # Singleton row — always id=1
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    subscription_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=2000)
    referral_commission_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=10)
    referral_discount_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=5)
    free_tutor_fast_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    free_tutor_thinking_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    free_tutor_deep_thinking_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    free_consultant_normal_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    free_consultant_thinking_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    free_practice_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    free_mock_test_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    free_capsule_followup_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    paid_tutor_fast_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    paid_tutor_thinking_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    paid_tutor_deep_thinking_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    paid_consultant_normal_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    paid_consultant_thinking_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    paid_practice_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    paid_mock_test_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    paid_capsule_followup_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    payment_qr_url: Mapped[str | None] = mapped_column(nullable=True)
    payment_instructions: Mapped[str | None] = mapped_column(nullable=True)
    demo_video_url: Mapped[str | None] = mapped_column(nullable=True)
    # Public stats overrides — if set, shown instead of real computed values
    stat_students_registered: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stat_mock_tests_attempted: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stat_questions_practiced: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stat_ai_tutor_messages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stat_career_guidance_sessions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    stat_practice_sessions_completed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
