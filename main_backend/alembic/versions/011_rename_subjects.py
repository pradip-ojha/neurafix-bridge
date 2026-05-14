"""Rename subject keys: compulsory_math→mathematics, compulsory_english→english, compulsory_science→science

Revision ID: 011
Revises: 010
Create Date: 2026-05-15
"""

from alembic import op

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None

_RENAMES = [
    ("compulsory_math", "mathematics"),
    ("compulsory_english", "english"),
    ("compulsory_science", "science"),
]

_TABLES = [
    "subject_chapters",
    "subject_timing_config",
    "level_notes",
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
