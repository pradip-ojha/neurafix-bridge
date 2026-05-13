"""Normalize subject chapter topics JSON shape

Revision ID: 008a
Revises: 008
Create Date: 2026-05-13
"""

from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa

revision = "008a"
down_revision = "008"
branch_labels = None
depends_on = None


def _normalize_topics(topics) -> list[dict]:
    normalized = []
    for topic in topics or []:
        topic_key = topic.get("topic") or topic.get("id")
        if topic_key:
            normalized.append({
                "topic": topic_key,
                "subtopics": topic.get("subtopics") or [],
            })
    return normalized


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, topics FROM subject_chapters")).mappings().all()
    for row in rows:
        topics = row["topics"]
        normalized = _normalize_topics(topics)
        if normalized != topics:
            conn.execute(
                sa.text("UPDATE subject_chapters SET topics = CAST(:topics AS JSONB), updated_at = now() WHERE id = :id"),
                {"id": row["id"], "topics": json.dumps(normalized)},
            )


def downgrade() -> None:
    pass
