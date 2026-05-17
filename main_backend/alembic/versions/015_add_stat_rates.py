"""Add per-day rate columns and base timestamp for auto-incrementing public stats

Revision ID: 015
Revises: 014
Create Date: 2026-05-17
"""

import sqlalchemy as sa
from alembic import op

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None

_RATE_COLUMNS = [
    "stat_students_registered_rate",
    "stat_mock_tests_attempted_rate",
    "stat_questions_practiced_rate",
    "stat_ai_tutor_messages_rate",
    "stat_career_guidance_sessions_rate",
    "stat_practice_sessions_completed_rate",
]


def upgrade() -> None:
    op.add_column("platform_config", sa.Column("stat_base_timestamp", sa.DateTime(timezone=True), nullable=True))
    for col in _RATE_COLUMNS:
        op.add_column("platform_config", sa.Column(col, sa.Float(), nullable=True))


def downgrade() -> None:
    for col in reversed(_RATE_COLUMNS):
        op.drop_column("platform_config", col)
    op.drop_column("platform_config", "stat_base_timestamp")
