from __future__ import annotations

from datetime import datetime, UTC
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ReferralEarningStatus(str, PyEnum):
    pending = "pending"
    paid = "paid"


class ReferralEarning(Base):
    __tablename__ = "referral_earnings"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, server_default="gen_random_uuid()")
    referrer_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    referred_user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    payment_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("payments.id", ondelete="SET NULL"), nullable=True)
    commission_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        Enum(ReferralEarningStatus, name="referral_earning_status_enum"),
        nullable=False,
        default=ReferralEarningStatus.pending,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
