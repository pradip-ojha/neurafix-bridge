"""phase13: add rate limit config + payment QR fields to platform_config

Revision ID: 004
Revises: 003
Create Date: 2026-05-08
"""
from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE platform_config
            ADD COLUMN IF NOT EXISTS trial_daily_message_limit INTEGER NOT NULL DEFAULT 20,
            ADD COLUMN IF NOT EXISTS paid_daily_message_limit INTEGER NOT NULL DEFAULT 50,
            ADD COLUMN IF NOT EXISTS payment_qr_url VARCHAR(500),
            ADD COLUMN IF NOT EXISTS payment_instructions TEXT
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE platform_config
            DROP COLUMN IF EXISTS trial_daily_message_limit,
            DROP COLUMN IF EXISTS paid_daily_message_limit,
            DROP COLUMN IF EXISTS payment_qr_url,
            DROP COLUMN IF EXISTS payment_instructions
    """)
