from __future__ import annotations

from pydantic import BaseModel


class RawChunk(BaseModel):
    text: str
    header_hint: str = ""
    topic_hint: str = ""     # text of the ## parent heading
    subtopic_hint: str = ""  # text of the ### parent heading


class RefinedChunk(BaseModel):
    text: str
    chapter: str
    topic: str
    subtopic: str
    chunk_type: str  # explanation | example | objective_question | definition


class NoteStatus(BaseModel):
    note_id: str
    status: str
    stage: str
    progress_pct: int
    message: str
    total_chunks: int | None = None
    error_message: str | None = None
