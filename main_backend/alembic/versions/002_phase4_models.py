"""phase4 models: payments, subscriptions, colleges, config, level notes, timing

Revision ID: 002
Revises: 001
Create Date: 2026-05-07

Drops stale Phase 1 tables that have incompatible schemas, then creates the
7 new Phase 4 tables and seeds default configuration rows.
"""
from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Drop stale Phase 1 tables (old schemas, incompatible with new design) ---
    op.execute("DROP TABLE IF EXISTS referral_earnings CASCADE")
    op.execute("DROP TABLE IF EXISTS referral_conversions CASCADE")
    op.execute("DROP TABLE IF EXISTS payment_requests CASCADE")
    op.execute("DROP TABLE IF EXISTS subscriptions CASCADE")
    op.execute("DROP TABLE IF EXISTS subscription_plans CASCADE")
    op.execute("DROP TABLE IF EXISTS colleges CASCADE")
    op.execute("DROP TABLE IF EXISTS platform_settings CASCADE")
    op.execute("DROP TABLE IF EXISTS platform_config CASCADE")
    op.execute("DROP TABLE IF EXISTS level_notes CASCADE")
    op.execute("DROP TABLE IF EXISTS subject_timing_config CASCADE")
    op.execute("DROP TABLE IF EXISTS referral_profiles CASCADE")
    op.execute("DROP TABLE IF EXISTS static_notes CASCADE")
    op.execute("DROP TABLE IF EXISTS payments CASCADE")

    # Drop any stale enum types from old Phase 1 schema
    op.execute("DROP TYPE IF EXISTS payment_status CASCADE")
    op.execute("DROP TYPE IF EXISTS payment_status_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS subscription_status CASCADE")
    op.execute("DROP TYPE IF EXISTS subscription_status_enum CASCADE")
    op.execute("DROP TYPE IF EXISTS referral_earning_status_enum CASCADE")

    # --- Create new enum types ---
    op.execute("CREATE TYPE payment_status_enum AS ENUM ('pending', 'approved', 'rejected')")
    op.execute("CREATE TYPE subscription_status_enum AS ENUM ('trial', 'active', 'expired')")
    op.execute("CREATE TYPE referral_earning_status_enum AS ENUM ('pending', 'paid')")

    # --- payments ---
    op.execute("""
        CREATE TABLE payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount NUMERIC(10, 2) NOT NULL,
            screenshot_url TEXT NOT NULL,
            status payment_status_enum NOT NULL DEFAULT 'pending',
            approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
            subscription_months INTEGER NOT NULL DEFAULT 1,
            referral_discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_payments_user_id ON payments(user_id)")
    op.execute("CREATE INDEX ix_payments_status ON payments(status)")

    # --- subscriptions ---
    op.execute("""
        CREATE TABLE subscriptions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            status subscription_status_enum NOT NULL DEFAULT 'trial',
            trial_ends_at TIMESTAMPTZ NOT NULL,
            subscription_ends_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # --- platform_config (singleton row) ---
    op.execute("""
        CREATE TABLE platform_config (
            id INTEGER PRIMARY KEY DEFAULT 1,
            subscription_price NUMERIC(10, 2) NOT NULL DEFAULT 2000,
            trial_duration_days INTEGER NOT NULL DEFAULT 7,
            referral_commission_pct NUMERIC(5, 2) NOT NULL DEFAULT 10,
            referral_discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 5,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT platform_config_single_row CHECK (id = 1)
        )
    """)

    # --- level_notes ---
    op.execute("""
        CREATE TABLE level_notes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            subject VARCHAR(100) NOT NULL,
            chapter VARCHAR(255) NOT NULL,
            level INTEGER NOT NULL CHECK (level IN (1, 2, 3)),
            display_name VARCHAR(500) NOT NULL,
            r2_key VARCHAR(500) NOT NULL,
            r2_url VARCHAR(1000) NOT NULL,
            uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_level_note UNIQUE (subject, chapter, level)
        )
    """)

    # --- colleges ---
    op.execute("""
        CREATE TABLE colleges (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            location VARCHAR(255),
            total_questions INTEGER NOT NULL,
            total_time_minutes INTEGER NOT NULL,
            question_distribution JSONB NOT NULL DEFAULT '{}',
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # --- subject_timing_config ---
    op.execute("""
        CREATE TABLE subject_timing_config (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            subject VARCHAR(100) NOT NULL,
            difficulty VARCHAR(10) NOT NULL,
            seconds_per_question INTEGER NOT NULL DEFAULT 72,
            CONSTRAINT uq_subject_difficulty UNIQUE (subject, difficulty)
        )
    """)

    # --- referral_earnings ---
    op.execute("""
        CREATE TABLE referral_earnings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            referred_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
            commission_amount NUMERIC(10, 2) NOT NULL,
            status referral_earning_status_enum NOT NULL DEFAULT 'pending',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_referral_earnings_referrer ON referral_earnings(referrer_id)")

    # --- Seed default PlatformConfig ---
    op.execute("""
        INSERT INTO platform_config (id, subscription_price, trial_duration_days, referral_commission_pct, referral_discount_pct)
        VALUES (1, 2000, 7, 10, 5)
        ON CONFLICT (id) DO NOTHING
    """)

    # --- Seed SubjectTimingConfig defaults (4 subjects × 3 difficulties) ---
    subjects = ['compulsory_math', 'optional_math', 'compulsory_english', 'compulsory_science']
    difficulties = ['easy', 'medium', 'hard']
    for subj in subjects:
        for diff in difficulties:
            op.execute(f"""
                INSERT INTO subject_timing_config (id, subject, difficulty, seconds_per_question)
                VALUES (gen_random_uuid(), '{subj}', '{diff}', 72)
                ON CONFLICT (subject, difficulty) DO NOTHING
            """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS referral_earnings CASCADE")
    op.execute("DROP TABLE IF EXISTS subject_timing_config CASCADE")
    op.execute("DROP TABLE IF EXISTS colleges CASCADE")
    op.execute("DROP TABLE IF EXISTS level_notes CASCADE")
    op.execute("DROP TABLE IF EXISTS platform_config CASCADE")
    op.execute("DROP TABLE IF EXISTS subscriptions CASCADE")
    op.execute("DROP TABLE IF EXISTS payments CASCADE")
    op.execute("DROP TYPE IF EXISTS referral_earning_status_enum")
    op.execute("DROP TYPE IF EXISTS subscription_status_enum")
    op.execute("DROP TYPE IF EXISTS payment_status_enum")
