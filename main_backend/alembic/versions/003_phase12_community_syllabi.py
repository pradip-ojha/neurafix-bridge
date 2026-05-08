"""phase12: community posts, post likes, college syllabi, past question papers

Revision ID: 003
Revises: 002
Create Date: 2026-05-08
"""
from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use DO block to create type only if it doesn't exist
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE post_type_enum AS ENUM ('post', 'announcement', 'notice');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS community_posts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            author_role VARCHAR(50) NOT NULL,
            content TEXT NOT NULL,
            image_url TEXT,
            link_url TEXT,
            post_type post_type_enum NOT NULL DEFAULT 'post',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_community_posts_author_id ON community_posts(author_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_community_posts_post_type ON community_posts(post_type)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_community_posts_created_at ON community_posts(created_at DESC)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS post_likes (
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
            PRIMARY KEY (user_id, post_id)
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS college_syllabi (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
            year INTEGER NOT NULL,
            display_name VARCHAR(255) NOT NULL,
            file_url TEXT NOT NULL,
            file_key TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_college_syllabi_college_id ON college_syllabi(college_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS past_question_papers (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            college_id UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
            year INTEGER NOT NULL,
            file_url TEXT NOT NULL,
            file_key TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_past_question_papers_college_id ON past_question_papers(college_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS past_question_papers CASCADE")
    op.execute("DROP TABLE IF EXISTS college_syllabi CASCADE")
    op.execute("DROP TABLE IF EXISTS post_likes CASCADE")
    op.execute("DROP TABLE IF EXISTS community_posts CASCADE")
    op.execute("DROP TYPE IF EXISTS post_type_enum CASCADE")
