"""create question_files table and add file_id FK to question tables

Revision ID: 009
Revises: 008
Create Date: 2026-05-07
"""

from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE question_files (
            id              VARCHAR(36)   PRIMARY KEY DEFAULT gen_random_uuid()::text,
            file_id         VARCHAR(255)  NOT NULL,
            file_type       VARCHAR(10)   NOT NULL CHECK (file_type IN ('main', 'extra')),
            subject         VARCHAR(100)  NOT NULL,
            chapter         VARCHAR(255),
            display_name    VARCHAR(255)  NOT NULL,
            r2_key          VARCHAR(500)  NOT NULL,
            r2_url          VARCHAR(1000) NOT NULL,
            total_questions INTEGER       NOT NULL DEFAULT 0,
            uploaded_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
            CONSTRAINT uq_question_files_file_id UNIQUE (file_id)
        )
    """)
    op.execute("CREATE INDEX ix_question_files_file_type ON question_files (file_type)")
    op.execute("CREATE INDEX ix_question_files_subject   ON question_files (subject)")

    op.execute("""
        ALTER TABLE main_questions
            ADD COLUMN IF NOT EXISTS file_id VARCHAR(36)
            REFERENCES question_files(id) ON DELETE SET NULL
    """)
    op.execute("""
        ALTER TABLE extra_questions
            ADD COLUMN IF NOT EXISTS file_id VARCHAR(36)
            REFERENCES question_files(id) ON DELETE SET NULL
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE extra_questions DROP COLUMN IF EXISTS file_id")
    op.execute("ALTER TABLE main_questions  DROP COLUMN IF EXISTS file_id")
    op.execute("DROP TABLE IF EXISTS question_files")
