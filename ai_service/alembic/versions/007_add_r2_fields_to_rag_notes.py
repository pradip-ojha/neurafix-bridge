"""add r2_key and r2_url to rag_notes

Revision ID: 007
Revises: 006
Create Date: 2026-05-07
"""
from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE rag_notes ADD COLUMN IF NOT EXISTS r2_key VARCHAR(500)")
    op.execute("ALTER TABLE rag_notes ADD COLUMN IF NOT EXISTS r2_url VARCHAR(1000)")


def downgrade() -> None:
    op.execute("ALTER TABLE rag_notes DROP COLUMN IF EXISTS r2_url")
    op.execute("ALTER TABLE rag_notes DROP COLUMN IF EXISTS r2_key")
