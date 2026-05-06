from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class SummaryOut(BaseModel):
    id: str
    user_id: str
    agent_type: str
    subject: str | None
    timeline: str
    content: str
    generated_at: datetime
    covers_period_start: datetime
    covers_period_end: datetime

    model_config = {"from_attributes": True}


class PlannerTimelineOut(BaseModel):
    id: str
    user_id: str
    content: str
    last_updated: datetime
    next_review_date: datetime | None
    version: int

    model_config = {"from_attributes": True}
