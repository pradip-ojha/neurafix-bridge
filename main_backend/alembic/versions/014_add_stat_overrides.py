"""Add admin-editable public stat override columns to platform_config

Revision ID: 014
Revises: 013
Create Date: 2026-05-17
"""

import sqlalchemy as sa
from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None

_COLUMNS = [
    "stat_students_registered",
    "stat_mock_tests_attempted",
    "stat_questions_practiced",
    "stat_ai_tutor_messages",
    "stat_career_guidance_sessions",
    "stat_practice_sessions_completed",
]


def upgrade() -> None:
    for col in _COLUMNS:
        op.add_column("platform_config", sa.Column(col, sa.Integer(), nullable=True))


def downgrade() -> None:
    for col in reversed(_COLUMNS):
        op.drop_column("platform_config", col)
