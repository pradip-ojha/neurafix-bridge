from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


class QuestionOptionIn(BaseModel):
    id: str
    text: str


class QuestionIn(BaseModel):
    question_id: str
    question_text: str
    options: list[QuestionOptionIn]
    correct_option_ids: list[str]
    explanation: str
    difficulty: str
    subject: str
    chapter: str
    topic: str
    subtopic: str | None = None
    tags: list[str] = []
    skill: str | None = None
    learning_objective: str | None = None
    common_mistakes: dict[str, str] = {}
    is_active: bool = True
    version: int = 1
    question_image: dict[str, Any] | None = None

    @field_validator("options")
    @classmethod
    def options_min_two(cls, v: list) -> list:
        if len(v) < 2:
            raise ValueError("question must have at least 2 options")
        return v

    @field_validator("correct_option_ids")
    @classmethod
    def correct_option_ids_nonempty(cls, v: list) -> list:
        if not v:
            raise ValueError("correct_option_ids must not be empty")
        return v

    @field_validator("difficulty")
    @classmethod
    def valid_difficulty(cls, v: str) -> str:
        if v not in ("easy", "medium", "hard"):
            raise ValueError(f"difficulty must be easy, medium, or hard; got '{v}'")
        return v


class ExtraQuestionIn(BaseModel):
    question_id: str
    question_text: str
    options: list[QuestionOptionIn]
    correct_option_ids: list[str]
    explanation: str
    difficulty: str
    subject: str
    tags: list[str] = []
    is_active: bool = True
    version: int = 1
    question_image: dict[str, Any] | None = None

    @field_validator("options")
    @classmethod
    def options_min_two(cls, v: list) -> list:
        if len(v) < 2:
            raise ValueError("question must have at least 2 options")
        return v

    @field_validator("correct_option_ids")
    @classmethod
    def correct_option_ids_nonempty(cls, v: list) -> list:
        if not v:
            raise ValueError("correct_option_ids must not be empty")
        return v

    @field_validator("difficulty")
    @classmethod
    def valid_difficulty(cls, v: str) -> str:
        if v not in ("easy", "medium", "hard"):
            raise ValueError(f"difficulty must be easy, medium, or hard; got '{v}'")
        return v


class ExtraUploadRequest(BaseModel):
    subject: str
    questions: list[ExtraQuestionIn]


class ExtraSubjectIn(BaseModel):
    subject_key: str
    display_name: str


class ExtraSubjectOut(BaseModel):
    subject_key: str
    display_name: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UploadResult(BaseModel):
    accepted: int
    rejected: int
    errors: list[str]
    file_id: str | None = None


class AnswerCheckRequest(BaseModel):
    question_ids: list[str]
    answers: dict[str, str]


class SingleAnswerResult(BaseModel):
    correct: bool
    correct_option_ids: list[str] | None = None
    explanation: str | None = None
    error: str | None = None


class AnswerCheckResult(BaseModel):
    results: dict[str, SingleAnswerResult]


class ChapterDifficultyCounts(BaseModel):
    easy: int
    medium: int
    hard: int
    total: int


class ChapterStats(BaseModel):
    chapter: str
    counts: ChapterDifficultyCounts


class PoolStatsResult(BaseModel):
    subject: str
    chapters: list[ChapterStats]


class QuestionFileOut(BaseModel):
    id: str
    file_id: str
    file_type: str
    subject: str
    chapter: str | None
    display_name: str
    r2_key: str
    r2_url: str
    total_questions: int
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class QuestionDetail(BaseModel):
    question_id: str
    data: dict[str, Any]
    is_active: bool
    difficulty: str


class QuestionFileDetailOut(BaseModel):
    id: str
    file_id: str
    file_type: str
    subject: str
    chapter: str | None
    display_name: str
    r2_key: str
    r2_url: str
    total_questions: int
    uploaded_at: datetime
    questions: list[QuestionDetail]
