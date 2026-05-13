"""subscription: per-feature free and paid rate limits

Revision ID: 009
Revises: 008a
Create Date: 2026-05-13
"""
from alembic import op

revision = "009"
down_revision = "008a"
branch_labels = None
depends_on = None


LIMIT_COLUMNS = {
    "free_tutor_fast_limit": 10,
    "free_tutor_thinking_limit": 5,
    "free_tutor_deep_thinking_limit": 3,
    "free_consultant_normal_limit": 5,
    "free_consultant_thinking_limit": 2,
    "free_practice_limit": 5,
    "free_mock_test_limit": 2,
    "free_capsule_followup_limit": 5,
    "paid_tutor_fast_limit": 100,
    "paid_tutor_thinking_limit": 50,
    "paid_tutor_deep_thinking_limit": 20,
    "paid_consultant_normal_limit": 30,
    "paid_consultant_thinking_limit": 15,
    "paid_practice_limit": 50,
    "paid_mock_test_limit": 20,
    "paid_capsule_followup_limit": 30,
}


def upgrade() -> None:
    for column, default in LIMIT_COLUMNS.items():
        op.execute(
            f"ALTER TABLE platform_config "
            f"ADD COLUMN IF NOT EXISTS {column} INTEGER NOT NULL DEFAULT {default}"
        )

    op.execute("""
        ALTER TABLE platform_config
            DROP COLUMN IF EXISTS trial_daily_message_limit,
            DROP COLUMN IF EXISTS paid_daily_message_limit,
            DROP COLUMN IF EXISTS trial_duration_days
    """)

    op.execute("ALTER TABLE subscriptions ALTER COLUMN trial_ends_at DROP NOT NULL")
    op.execute("UPDATE subscriptions SET status = 'free', trial_ends_at = NULL WHERE status = 'trial'")

    set_clause = ", ".join(f"{column} = {default}" for column, default in LIMIT_COLUMNS.items())
    op.execute(f"UPDATE platform_config SET {set_clause} WHERE id = 1")


def downgrade() -> None:
    op.execute("""
        ALTER TABLE platform_config
            ADD COLUMN IF NOT EXISTS trial_duration_days INTEGER NOT NULL DEFAULT 7,
            ADD COLUMN IF NOT EXISTS trial_daily_message_limit INTEGER NOT NULL DEFAULT 20,
            ADD COLUMN IF NOT EXISTS paid_daily_message_limit INTEGER NOT NULL DEFAULT 50
    """)
    for column in LIMIT_COLUMNS:
        op.execute(f"ALTER TABLE platform_config DROP COLUMN IF EXISTS {column}")
    op.execute("ALTER TABLE subscriptions ALTER COLUMN trial_ends_at SET NOT NULL")
