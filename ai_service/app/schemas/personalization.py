from __future__ import annotations

from datetime import datetime, date

from pydantic import BaseModel


class OverallSummaryOut(BaseModel):
    id: str
    user_id: str
    content: str
    generated_at: datetime
    covers_through: date

    model_config = {"from_attributes": True}


class SubjectSummaryOut(BaseModel):
    id: str
    user_id: str
    subject: str
    summary_type: str
    content: str
    generated_at: datetime
    summary_date: date | None

    model_config = {"from_attributes": True}


class ConsultantTimelineOut(BaseModel):
    id: str
    user_id: str
    content: str
    last_updated: datetime
    version: int

    model_config = {"from_attributes": True}


class StudentLevelOut(BaseModel):
    id: str
    user_id: str
    subject: str
    level: int
    assigned_at: datetime

    model_config = {"from_attributes": True}


class PracticeSessionSummaryOut(BaseModel):
    id: str
    user_id: str
    subject: str
    chapter: str
    session_date: date
    total_questions: int
    correct_count: int
    incorrect_count: int
    topic_breakdown: dict
    summary_content: str
    created_at: datetime

    model_config = {"from_attributes": True}
