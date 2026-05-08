"""Create daily_capsules table

Revision ID: 012
Revises: 011
Create Date: 2026-05-08
"""

from alembic import op

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old Phase 1 draft table (different column set, no user_id)
    op.execute("DROP TABLE IF EXISTS daily_capsules CASCADE")

    op.execute("""
        CREATE TABLE daily_capsules (
            id           VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
            user_id      VARCHAR(36)  NOT NULL,
            subject      VARCHAR(100) NOT NULL,
            capsule_date DATE         NOT NULL,
            content      TEXT         NOT NULL,
            created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
            CONSTRAINT uq_daily_capsules_user_subject_date UNIQUE (user_id, subject, capsule_date)
        )
    """)
    op.execute("CREATE INDEX ix_daily_capsules_user_id ON daily_capsules (user_id)")
    op.execute("CREATE INDEX ix_daily_capsules_user_subject ON daily_capsules (user_id, subject)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS daily_capsules CASCADE")
