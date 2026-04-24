"""add book_file_url and book_file_key to rag_jobs

Revision ID: 002
Revises: 001
Create Date: 2026-04-20
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("rag_jobs", sa.Column("book_file_url", sa.String(2048), nullable=True))
    op.add_column("rag_jobs", sa.Column("book_file_key", sa.String(1024), nullable=True))


def downgrade() -> None:
    op.drop_column("rag_jobs", "book_file_key")
    op.drop_column("rag_jobs", "book_file_url")
