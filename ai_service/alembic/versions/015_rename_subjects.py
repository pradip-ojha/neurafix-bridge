"""Rename subject keys: compulsory_math→mathematics, compulsory_english→english, compulsory_science→science

Revision ID: 015
Revises: 014
Create Date: 2026-05-15
"""

from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None

_RENAMES = [
    ("compulsory_math", "mathematics"),
    ("compulsory_english", "english"),
    ("compulsory_science", "science"),
]

_TABLES = [
    "main_questions",
    "question_files",
    "practice_sessions",
    "practice_session_summaries",
    "chat_sessions",
    "subject_summaries",
    "session_memories",
    "daily_capsules",
    "student_levels",
    "rag_notes",
]


def upgrade() -> None:
    for table in _TABLES:
        for old, new in _RENAMES:
            op.execute(
                f"UPDATE {table} SET subject = '{new}' WHERE subject = '{old}'"
            )


def downgrade() -> None:
    for table in _TABLES:
        for old, new in _RENAMES:
            op.execute(
                f"UPDATE {table} SET subject = '{old}' WHERE subject = '{new}'"
            )
