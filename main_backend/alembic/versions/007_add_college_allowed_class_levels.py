"""Add class_level_distribution column to colleges

Revision ID: 007
Revises: 006
Create Date: 2026-05-12
"""

from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE colleges
        ADD COLUMN class_level_distribution JSONB
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE colleges DROP COLUMN IF EXISTS class_level_distribution")
