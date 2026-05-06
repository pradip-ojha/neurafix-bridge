"""drop stale phase1 question tables

mock_test_questions and practice_questions stored full question text per
session in Phase 1. The new design uses main_questions / extra_questions as
the permanent pool; sessions reference question_ids and call check-answers.
These tables have no code references and are safe to drop.

Revision ID: 008
Revises: 007
Create Date: 2026-05-07
"""
from alembic import op

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS mock_test_questions CASCADE")
    op.execute("DROP TABLE IF EXISTS practice_questions CASCADE")


def downgrade() -> None:
    # These tables belonged to the old Phase 1 design and are not restored.
    pass
