"""create rag_jobs table

Revision ID: 001
Revises:
Create Date: 2026-04-16
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rag_jobs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("book_id", sa.String(255), nullable=False, index=True),
        sa.Column("book_title", sa.String(500), nullable=False),
        sa.Column("subject", sa.String(100), nullable=False),
        sa.Column("class_level", sa.String(20), nullable=False, server_default="10"),
        sa.Column("stream", sa.String(50), nullable=False),
        sa.Column("book_type", sa.String(50), nullable=False),
        sa.Column("publisher", sa.String(255), nullable=False),
        sa.Column(
            "status",
            sa.Enum("queued", "processing", "completed", "failed", name="rag_job_status"),
            nullable=False,
            server_default="queued",
        ),
        sa.Column("total_chunks", sa.Integer, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("rag_jobs")
    op.execute("DROP TYPE IF EXISTS rag_job_status")
