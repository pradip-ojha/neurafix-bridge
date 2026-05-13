"""subscription: convert legacy expired rows to free

Revision ID: 009a
Revises: 009
Create Date: 2026-05-13
"""
from alembic import op

revision = "009a"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        UPDATE subscriptions
        SET status = 'free',
            trial_ends_at = NULL,
            subscription_ends_at = NULL
        WHERE status = 'expired'
    """)


def downgrade() -> None:
    pass
