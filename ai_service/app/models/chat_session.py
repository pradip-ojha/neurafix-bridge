import uuid
from datetime import datetime, date, UTC
from enum import Enum as PyEnum

from sqlalchemy import String, Text, Date, DateTime, Enum, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.personalization import AgentType


class MessageRole(str, PyEnum):
    user = "user"
    assistant = "assistant"


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    agent_type: Mapped[str] = mapped_column(Enum(AgentType, name="agent_type_enum"), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(100), nullable=True)
    session_date: Mapped[date] = mapped_column(Date, nullable=False, default=lambda: datetime.now(UTC).date())
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="New Session")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))

    messages: Mapped[list["ChatMessage"]] = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(Enum(MessageRole, name="message_role_enum"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))

    session: Mapped["ChatSession"] = relationship("ChatSession", back_populates="messages")
