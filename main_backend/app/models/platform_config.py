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
    trial_duration_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    referral_commission_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=10)
    referral_discount_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=5)
    trial_daily_message_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    paid_daily_message_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    payment_qr_url: Mapped[str | None] = mapped_column(nullable=True)
    payment_instructions: Mapped[str | None] = mapped_column(nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
