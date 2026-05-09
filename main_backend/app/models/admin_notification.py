from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AdminNotification(Base):
    __tablename__ = "admin_notifications"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, server_default="gen_random_uuid()")
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
