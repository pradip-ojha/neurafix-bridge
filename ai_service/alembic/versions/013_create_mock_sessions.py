"""Create mock_sessions table

Revision ID: 013
Revises: 012
Create Date: 2026-05-08
"""

from alembic import op

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE mock_session_status_enum AS ENUM ('active', 'submitted')")
    op.execute("""
        CREATE TABLE mock_sessions (
            id                  VARCHAR(36)              PRIMARY KEY DEFAULT gen_random_uuid()::text,
            user_id             VARCHAR(36)              NOT NULL,
            college_id          VARCHAR(36),
            session_date        DATE                     NOT NULL,
            status              mock_session_status_enum NOT NULL DEFAULT 'active',
            question_ids        JSONB                    NOT NULL DEFAULT '{}',
            time_limit_minutes  INTEGER                  NOT NULL,
            score_data          JSONB,
            created_at          TIMESTAMPTZ              NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_mock_sessions_user_id ON mock_sessions (user_id)")
    op.execute("CREATE INDEX ix_mock_sessions_college_id ON mock_sessions (college_id)")
    op.execute(
        "CREATE INDEX ix_mock_sessions_college_date ON mock_sessions (college_id, session_date)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS mock_sessions CASCADE")
    op.execute("DROP TYPE IF EXISTS mock_session_status_enum")
