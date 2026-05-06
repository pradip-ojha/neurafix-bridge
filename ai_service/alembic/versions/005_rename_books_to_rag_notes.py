"""rename books to rag_notes, rework columns for text-only RAG

Revision ID: 005
Revises: 004
Create Date: 2026-05-06
"""
from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename table
    op.execute("ALTER TABLE books RENAME TO rag_notes")

    # Rename columns
    op.execute("ALTER TABLE rag_notes RENAME COLUMN book_id TO note_id")
    op.execute("ALTER TABLE rag_notes RENAME COLUMN book_title TO display_name")

    # Drop book-specific columns no longer needed
    op.execute("ALTER TABLE rag_notes DROP COLUMN IF EXISTS class_level")
    op.execute("ALTER TABLE rag_notes DROP COLUMN IF EXISTS stream")
    op.execute("ALTER TABLE rag_notes DROP COLUMN IF EXISTS book_type")
    op.execute("ALTER TABLE rag_notes DROP COLUMN IF EXISTS publisher")
    op.execute("ALTER TABLE rag_notes DROP COLUMN IF EXISTS book_file_url")
    op.execute("ALTER TABLE rag_notes DROP COLUMN IF EXISTS book_file_key")

    # Add chapter column
    op.execute("ALTER TABLE rag_notes ADD COLUMN chapter VARCHAR(255) NOT NULL DEFAULT ''")

    # Add unique constraint on note_id (book_id only had an index before)
    op.execute("ALTER TABLE rag_notes ADD CONSTRAINT rag_notes_note_id_key UNIQUE (note_id)")

    # Rename enum type
    op.execute("ALTER TYPE book_status RENAME TO rag_note_status")


def downgrade() -> None:
    op.execute("ALTER TYPE rag_note_status RENAME TO book_status")
    op.execute("ALTER TABLE rag_notes DROP CONSTRAINT IF EXISTS rag_notes_note_id_key")
    op.execute("ALTER TABLE rag_notes DROP COLUMN IF EXISTS chapter")
    op.execute("ALTER TABLE rag_notes ADD COLUMN book_file_key VARCHAR(1024)")
    op.execute("ALTER TABLE rag_notes ADD COLUMN book_file_url VARCHAR(2048)")
    op.execute("ALTER TABLE rag_notes ADD COLUMN publisher VARCHAR(255) NOT NULL DEFAULT ''")
    op.execute("ALTER TABLE rag_notes ADD COLUMN book_type VARCHAR(50) NOT NULL DEFAULT ''")
    op.execute("ALTER TABLE rag_notes ADD COLUMN stream VARCHAR(50) NOT NULL DEFAULT ''")
    op.execute("ALTER TABLE rag_notes ADD COLUMN class_level VARCHAR(20) NOT NULL DEFAULT '10'")
    op.execute("ALTER TABLE rag_notes RENAME COLUMN display_name TO book_title")
    op.execute("ALTER TABLE rag_notes RENAME COLUMN note_id TO book_id")
    op.execute("ALTER TABLE rag_notes RENAME TO books")
