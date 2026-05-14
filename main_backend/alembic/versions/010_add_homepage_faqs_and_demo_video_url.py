"""homepage: add homepage_faqs table and demo_video_url to platform_config

Revision ID: 010
Revises: 009a
Create Date: 2026-05-14
"""
import sqlalchemy as sa
from alembic import op

revision = "010"
down_revision = "009a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "homepage_faqs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.add_column(
        "platform_config",
        sa.Column("demo_video_url", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("platform_config", "demo_video_url")
    op.drop_table("homepage_faqs")
