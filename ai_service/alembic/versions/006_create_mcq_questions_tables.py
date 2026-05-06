"""create mcq questions tables

Revision ID: 006
Revises: 005
Create Date: 2026-05-07
"""
from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE difficulty_enum AS ENUM ('easy', 'medium', 'hard');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)

    op.execute("""
        CREATE TABLE main_questions (
            id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
            question_id VARCHAR(255) NOT NULL UNIQUE,
            subject VARCHAR(100) NOT NULL,
            chapter VARCHAR(255) NOT NULL,
            topic VARCHAR(255) NOT NULL,
            subtopic VARCHAR(255),
            difficulty difficulty_enum NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            version INTEGER NOT NULL DEFAULT 1,
            data JSONB NOT NULL
        )
    """)

    op.execute("""
        CREATE TABLE extra_questions (
            id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
            question_id VARCHAR(255) NOT NULL UNIQUE,
            subject VARCHAR(100) NOT NULL,
            difficulty difficulty_enum NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            version INTEGER NOT NULL DEFAULT 1,
            data JSONB NOT NULL
        )
    """)

    op.execute("""
        CREATE TABLE extra_subjects (
            id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
            subject_key VARCHAR(100) NOT NULL UNIQUE,
            display_name VARCHAR(255) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("CREATE INDEX ix_main_questions_subject_chapter ON main_questions (subject, chapter)")
    op.execute("CREATE INDEX ix_main_questions_difficulty ON main_questions (difficulty)")
    op.execute("CREATE INDEX ix_extra_questions_subject ON extra_questions (subject)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS extra_subjects")
    op.execute("DROP TABLE IF EXISTS extra_questions")
    op.execute("DROP TABLE IF EXISTS main_questions")
    op.execute("DROP TYPE IF EXISTS difficulty_enum")
