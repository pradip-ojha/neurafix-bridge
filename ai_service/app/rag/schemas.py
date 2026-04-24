from __future__ import annotations

from typing import Any
from pydantic import BaseModel


class BookUploadRequest(BaseModel):
    book_id: str
    book_title: str
    subject: str
    class_level: str = "10"
    stream: str
    book_type: str
    publisher: str


class PageImage(BaseModel):
    page_number: int
    index: int
    r2_key: str
    url: str
    description: str = ""       # vision-generated description of the image
    topics: list[str] = []      # educational topics the image relates to


class RawChunk(BaseModel):
    text: str
    page_number: int
    chapter_hint: str = ""
    image_blocks: list[dict[str, Any]] = []
    image_urls: list[str] = []  # pre-resolved R2 URLs (docx path only)


class RefinedChunk(BaseModel):
    text: str
    page_number: int            # kept for internal image linking; NOT stored in Pinecone
    chapter: str
    topic: str
    chunk_type: str             # question | example | explanation | definition | diagram_description
    image_urls: list[str] = []
    image_descriptions: list[str] = []


class JobStatus(BaseModel):
    job_id: str
    status: str
    stage: str
    progress_pct: int
    message: str
    total_chunks: int | None = None
    error_message: str | None = None
