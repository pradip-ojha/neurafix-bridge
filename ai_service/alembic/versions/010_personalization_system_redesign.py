"""Personalization system redesign — new summary tables, drop old ones

Revision ID: 010
Revises: 009
Create Date: 2026-05-07
"""

from alembic import op

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -----------------------------------------------------------------
    # 1. Extend agent_type_enum with new agent values
    #    IF NOT EXISTS prevents errors if already applied
    # -----------------------------------------------------------------
    op.execute("ALTER TYPE agent_type_enum ADD VALUE IF NOT EXISTS 'consultant'")
    op.execute("ALTER TYPE agent_type_enum ADD VALUE IF NOT EXISTS 'personalization'")

    # -----------------------------------------------------------------
    # 2. Drop old personalization tables (data is placeholder text only)
    # -----------------------------------------------------------------
    op.execute("DROP TABLE IF EXISTS personalization_summaries CASCADE")
    op.execute("DROP TABLE IF EXISTS planner_timelines CASCADE")

    # Drop old timeline_type_enum (no longer needed)
    op.execute("DROP TYPE IF EXISTS timeline_type_enum")

    # -----------------------------------------------------------------
    # 3. Create summary_type_enum
    # -----------------------------------------------------------------
    op.execute("CREATE TYPE summary_type_enum AS ENUM ('all_time', 'weekly', 'daily')")

    # -----------------------------------------------------------------
    # 4. overall_student_summaries — one row per student
    # -----------------------------------------------------------------
    op.execute("""
        CREATE TABLE overall_student_summaries (
            id              VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
            user_id         VARCHAR(36)  NOT NULL,
            content         TEXT         NOT NULL,
            generated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
            covers_through  DATE         NOT NULL,
            CONSTRAINT uq_overall_summary_user UNIQUE (user_id)
        )
    """)
    op.execute("CREATE INDEX ix_overall_student_summaries_user_id ON overall_student_summaries (user_id)")

    # -----------------------------------------------------------------
    # 5. subject_summaries — all_time/weekly/daily per subject per user
    # -----------------------------------------------------------------
    op.execute("""
        CREATE TABLE subject_summaries (
            id              VARCHAR(36)         PRIMARY KEY DEFAULT gen_random_uuid()::text,
            user_id         VARCHAR(36)         NOT NULL,
            subject         VARCHAR(100)        NOT NULL,
            summary_type    summary_type_enum   NOT NULL,
            content         TEXT                NOT NULL,
            generated_at    TIMESTAMPTZ         NOT NULL DEFAULT now(),
            summary_date    DATE                        -- NULL for all_time/weekly; date for daily
        )
    """)
    op.execute("CREATE INDEX ix_subject_summaries_user_subject ON subject_summaries (user_id, subject)")
    # One all_time/weekly per (user, subject, type)
    op.execute("""
        CREATE UNIQUE INDEX uq_subject_summary_nondaily
            ON subject_summaries (user_id, subject, summary_type)
            WHERE summary_type IN ('all_time', 'weekly')
    """)
    # One daily per (user, subject, date)
    op.execute("""
        CREATE UNIQUE INDEX uq_subject_summary_daily
            ON subject_summaries (user_id, subject, summary_type, summary_date)
            WHERE summary_type = 'daily'
    """)

    # -----------------------------------------------------------------
    # 6. session_memories — one per chat session
    # -----------------------------------------------------------------
    op.execute("""
        CREATE TABLE session_memories (
            id                          VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
            session_id                  VARCHAR(36)  NOT NULL UNIQUE
                                            REFERENCES chat_sessions(id) ON DELETE CASCADE,
            user_id                     VARCHAR(36)  NOT NULL,
            subject                     VARCHAR(100),
            content                     TEXT         NOT NULL,
            message_count_at_generation INTEGER      NOT NULL,
            generated_at                TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_session_memories_user_id   ON session_memories (user_id)")
    op.execute("CREATE INDEX ix_session_memories_session_id ON session_memories (session_id)")

    # -----------------------------------------------------------------
    # 7. consultant_timelines — one per student
    # -----------------------------------------------------------------
    op.execute("""
        CREATE TABLE consultant_timelines (
            id           VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
            user_id      VARCHAR(36)  NOT NULL,
            content      TEXT         NOT NULL,
            last_updated TIMESTAMPTZ  NOT NULL DEFAULT now(),
            version      INTEGER      NOT NULL DEFAULT 1,
            CONSTRAINT uq_consultant_timeline_user UNIQUE (user_id)
        )
    """)
    op.execute("CREATE INDEX ix_consultant_timelines_user_id ON consultant_timelines (user_id)")

    # -----------------------------------------------------------------
    # 8. practice_session_summaries — one per practice session
    # -----------------------------------------------------------------
    op.execute("""
        CREATE TABLE practice_session_summaries (
            id               VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
            user_id          VARCHAR(36)  NOT NULL,
            subject          VARCHAR(100) NOT NULL,
            chapter          VARCHAR(200) NOT NULL,
            session_date     DATE         NOT NULL,
            total_questions  INTEGER      NOT NULL,
            correct_count    INTEGER      NOT NULL,
            incorrect_count  INTEGER      NOT NULL,
            topic_breakdown  JSONB        NOT NULL DEFAULT '{}',
            summary_content  TEXT         NOT NULL,
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_practice_session_summaries_user_id ON practice_session_summaries (user_id)")
    op.execute("CREATE INDEX ix_practice_session_summaries_user_subject ON practice_session_summaries (user_id, subject)")
    op.execute("CREATE INDEX ix_practice_session_summaries_session_date ON practice_session_summaries (user_id, session_date)")

    # -----------------------------------------------------------------
    # 9. student_levels — learning level per subject per student
    # -----------------------------------------------------------------
    op.execute("""
        CREATE TABLE student_levels (
            id          VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
            user_id     VARCHAR(36)  NOT NULL,
            subject     VARCHAR(100) NOT NULL,
            level       INTEGER      NOT NULL CHECK (level IN (1, 2, 3)),
            assigned_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
            CONSTRAINT uq_student_level_user_subject UNIQUE (user_id, subject)
        )
    """)
    op.execute("CREATE INDEX ix_student_levels_user_id ON student_levels (user_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS student_levels CASCADE")
    op.execute("DROP TABLE IF EXISTS practice_session_summaries CASCADE")
    op.execute("DROP TABLE IF EXISTS consultant_timelines CASCADE")
    op.execute("DROP TABLE IF EXISTS session_memories CASCADE")
    op.execute("DROP TABLE IF EXISTS subject_summaries CASCADE")
    op.execute("DROP TABLE IF EXISTS overall_student_summaries CASCADE")
    op.execute("DROP TYPE IF EXISTS summary_type_enum")
    # Restoring dropped tables is not supported in downgrade; data is gone.
