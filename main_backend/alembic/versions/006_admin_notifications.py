"""admin_notifications table

Revision ID: 006
Revises: 005
Create Date: 2026-05-09
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admin_notifications",
        sa.Column("id", UUID(as_uuid=False), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("type", sa.String(100), nullable=False),
        sa.Column("payload", JSONB, nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("ix_admin_notifications_created_at", "admin_notifications", ["created_at"])


def downgrade() -> None:
    op.drop_table("admin_notifications")
