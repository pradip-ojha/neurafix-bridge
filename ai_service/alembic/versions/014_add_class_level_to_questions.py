"""Add class_level column to main_questions

Revision ID: 014
Revises: 013
Create Date: 2026-05-12
"""

from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE main_questions
        ADD COLUMN class_level INTEGER
    """)
    op.execute("CREATE INDEX ix_main_questions_class_level ON main_questions (class_level)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_main_questions_class_level")
    op.execute("ALTER TABLE main_questions DROP COLUMN IF EXISTS class_level")
