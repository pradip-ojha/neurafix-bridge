from datetime import datetime

from pydantic import BaseModel


class MarksheetEntry(BaseModel):
    year: str
    url: str


class ProfileOut(BaseModel):
    id: str
    user_id: str
    stream: str | None
    school_name: str | None
    school_address: str | None
    class_8_scores: dict | None
    class_9_scores: dict | None
    class_10_scores: dict | None
    see_gpa: float | None
    marksheet_urls: list | None
    notes: str | None
    profile_completion_pct: int
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    school_name: str | None = None
    school_address: str | None = None
    see_gpa: float | None = None
    class_8_scores: dict | None = None
    class_9_scores: dict | None = None
    class_10_scores: dict | None = None
    notes: str | None = None
