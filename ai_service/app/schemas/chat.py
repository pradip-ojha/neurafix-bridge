from __future__ import annotations

from datetime import datetime, date
from typing import Any

from pydantic import BaseModel


class ChatRequest(BaseModel):
    subject: str
    message: str
    session_id: str | None = None


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    metadata: Any | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    id: str
    subject: str | None
    session_date: date
    title: str
    agent_type: str

    model_config = {"from_attributes": True}
