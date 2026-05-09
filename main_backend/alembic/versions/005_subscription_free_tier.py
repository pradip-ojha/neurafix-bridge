"""subscription: add free tier status

Revision ID: 005
Revises: 004
Create Date: 2026-05-09
"""
from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE subscription_status_enum ADD VALUE IF NOT EXISTS 'free'")


def downgrade() -> None:
    pass  # PostgreSQL cannot remove enum values
