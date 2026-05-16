"""Replace flat college exam config with per-stream science_config and management_config

Revision ID: 013
Revises: 012
Create Date: 2026-05-16
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("colleges", sa.Column("science_config", JSONB, nullable=True))
    op.add_column("colleges", sa.Column("management_config", JSONB, nullable=True))

    # Migrate existing flat config into science_config
    op.execute("""
        UPDATE colleges
        SET science_config = jsonb_build_object(
            'total_questions', total_questions,
            'total_time_minutes', total_time_minutes,
            'question_distribution', question_distribution,
            'class_level_distribution', class_level_distribution
        )
        WHERE total_questions IS NOT NULL
    """)

    op.drop_column("colleges", "class_level_distribution")
    op.drop_column("colleges", "question_distribution")
    op.drop_column("colleges", "total_time_minutes")
    op.drop_column("colleges", "total_questions")


def downgrade() -> None:
    op.add_column("colleges", sa.Column("total_questions", sa.Integer(), nullable=True))
    op.add_column("colleges", sa.Column("total_time_minutes", sa.Integer(), nullable=True))
    op.add_column("colleges", sa.Column("question_distribution", JSONB, nullable=True))
    op.add_column("colleges", sa.Column("class_level_distribution", JSONB, nullable=True))

    # Restore flat fields from science_config
    op.execute("""
        UPDATE colleges
        SET
            total_questions        = (science_config->>'total_questions')::int,
            total_time_minutes     = (science_config->>'total_time_minutes')::int,
            question_distribution  = COALESCE(science_config->'question_distribution', '{}'),
            class_level_distribution = science_config->'class_level_distribution'
        WHERE science_config IS NOT NULL
    """)

    op.drop_column("colleges", "management_config")
    op.drop_column("colleges", "science_config")
