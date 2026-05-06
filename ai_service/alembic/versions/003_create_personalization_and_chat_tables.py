"""create personalization and chat tables

Revision ID: 003
Revises: 002
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop old chat tables that have incorrect schemas (wrong column names / types)
    # from a prior schema draft. Safe to drop: Phase 4 is not yet live, no real data.
    op.execute("DROP TABLE IF EXISTS chat_messages CASCADE")
    op.execute("DROP TABLE IF EXISTS chat_sessions CASCADE")
    op.execute("DROP TYPE IF EXISTS agent_type_enum")
    op.execute("DROP TYPE IF EXISTS timeline_type_enum")
    op.execute("DROP TYPE IF EXISTS message_role_enum")

    # Create enum types explicitly via SQL (avoids SQLAlchemy double-creation)
    op.execute("CREATE TYPE agent_type_enum AS ENUM ('tutor', 'capsule', 'practice', 'planner')")
    op.execute("CREATE TYPE timeline_type_enum AS ENUM ('daily', 'weekly', 'fifteen_day', 'monthly', 'all_time')")
    op.execute("CREATE TYPE message_role_enum AS ENUM ('user', 'assistant')")

    # Use PG_ENUM with create_type=False so op.create_table does NOT attempt a second CREATE TYPE
    agent_t = PG_ENUM(name="agent_type_enum", create_type=False)
    timeline_t = PG_ENUM(name="timeline_type_enum", create_type=False)
    role_t = PG_ENUM(name="message_role_enum", create_type=False)

    op.create_table(
        "personalization_summaries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False, index=True),
        sa.Column("agent_type", agent_t, nullable=False),
        sa.Column("subject", sa.String(100), nullable=True),
        sa.Column("timeline", timeline_t, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("covers_period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("covers_period_end", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "agent_type", "subject", "timeline", name="uq_summary_per_timeline"),
    )

    op.create_table(
        "planner_timelines",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False, unique=True, index=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("last_updated", sa.DateTime(timezone=True), nullable=False),
        sa.Column("next_review_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
    )

    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False, index=True),
        sa.Column("agent_type", agent_t, nullable=False),
        sa.Column("subject", sa.String(100), nullable=True),
        sa.Column("session_date", sa.Date, nullable=False),
        sa.Column("title", sa.String(255), nullable=False, server_default="New Session"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("role", role_t, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("metadata", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
    op.drop_table("planner_timelines")
    op.drop_table("personalization_summaries")
    op.execute("DROP TYPE IF EXISTS message_role_enum")
    op.execute("DROP TYPE IF EXISTS timeline_type_enum")
    op.execute("DROP TYPE IF EXISTS agent_type_enum")
