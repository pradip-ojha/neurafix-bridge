"""Create practice_sessions table (replaces Phase 6 draft schema)

Revision ID: 011
Revises: 010
Create Date: 2026-05-08
"""

from alembic import op

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the Phase 6 draft table (different column set, no data)
    op.execute("DROP TABLE IF EXISTS practice_sessions CASCADE")

    op.execute("""
        DO $$ BEGIN
            CREATE TYPE practice_session_status_enum AS ENUM ('active', 'submitted', 'closed');
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
    """)

    op.execute("""
        CREATE TABLE practice_sessions (
            id           VARCHAR(36)                    PRIMARY KEY DEFAULT gen_random_uuid()::text,
            user_id      VARCHAR(36)                    NOT NULL,
            subject      VARCHAR(100)                   NOT NULL,
            chapter      VARCHAR(255)                   NOT NULL,
            session_date DATE                           NOT NULL,
            status       practice_session_status_enum   NOT NULL DEFAULT 'active',
            question_ids JSONB                          NOT NULL DEFAULT '[]',
            config       JSONB                          NOT NULL DEFAULT '{}',
            score_data   JSONB,
            created_at   TIMESTAMPTZ                    NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_practice_sessions_user_id ON practice_sessions (user_id)")
    op.execute("CREATE INDEX ix_practice_sessions_user_subject_chapter ON practice_sessions (user_id, subject, chapter)")
    op.execute("CREATE INDEX ix_practice_sessions_user_date ON practice_sessions (user_id, session_date)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS practice_sessions CASCADE")
    op.execute("DROP TYPE IF EXISTS practice_session_status_enum")
