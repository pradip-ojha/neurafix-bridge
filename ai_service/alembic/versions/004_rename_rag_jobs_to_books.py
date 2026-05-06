"""rename rag_jobs to books, drop book_chunks

Revision ID: 004
Revises: 003
Create Date: 2026-04-27
"""
from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old stale tables from a prior schema draft (safe — no live data there)
    op.execute("DROP TABLE IF EXISTS book_chunks CASCADE")
    op.execute("DROP TABLE IF EXISTS books CASCADE")

    # Rename the live table and its enum type to the clean names
    op.execute("ALTER TABLE rag_jobs RENAME TO books")
    op.execute("ALTER TYPE rag_job_status RENAME TO book_status")


def downgrade() -> None:
    op.execute("ALTER TYPE book_status RENAME TO rag_job_status")
    op.execute("ALTER TABLE books RENAME TO rag_jobs")
