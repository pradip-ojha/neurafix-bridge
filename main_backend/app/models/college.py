from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class College(Base):
    __tablename__ = "colleges"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, server_default="gen_random_uuid()")
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    science_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    management_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
