from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_role
from app.database import get_db
from app.models.payment import Payment, PaymentStatus
from app.models.student_profile import StudentProfile, Stream
from app.models.subscription import Subscription, SubscriptionStatus
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/admin", tags=["admin-analytics"])

_admin_only = require_role("admin")


@router.get("/analytics/overview")
async def analytics_overview(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar_one()

    students = (
        await db.execute(select(func.count()).select_from(User).where(User.role == UserRole.student))
    ).scalar_one()

    affiliates = (
        await db.execute(
            select(func.count()).select_from(User).where(User.role == UserRole.affiliation_partner)
        )
    ).scalar_one()

    free_count = (
        await db.execute(
            select(func.count()).select_from(Subscription).where(Subscription.status == SubscriptionStatus.free)
        )
    ).scalar_one()

    active_count = (
        await db.execute(
            select(func.count()).select_from(Subscription).where(Subscription.status == SubscriptionStatus.active)
        )
    ).scalar_one()

    expired_count = (
        await db.execute(
            select(func.count()).select_from(Subscription).where(Subscription.status == SubscriptionStatus.expired)
        )
    ).scalar_one()

    science_count = (
        await db.execute(
            select(func.count()).select_from(StudentProfile).where(StudentProfile.stream == Stream.science)
        )
    ).scalar_one()

    management_count = (
        await db.execute(
            select(func.count()).select_from(StudentProfile).where(StudentProfile.stream == Stream.management)
        )
    ).scalar_one()

    pending_payments = (
        await db.execute(
            select(func.count()).select_from(Payment).where(Payment.status == PaymentStatus.pending)
        )
    ).scalar_one()

    recent_result = await db.execute(
        select(Payment).order_by(Payment.created_at.desc()).limit(5)
    )
    recent_payments = [
        {
            "id": p.id,
            "user_id": p.user_id,
            "amount": float(p.amount),
            "status": p.status,
            "created_at": p.created_at,
        }
        for p in recent_result.scalars().all()
    ]

    return {
        "total_users": total_users,
        "students": students,
        "affiliation_partners": affiliates,
        "subscriptions": {
            "free": free_count,
            "active": active_count,
            "expired": expired_count,
        },
        "streams": {
            "science": science_count,
            "management": management_count,
        },
        "pending_payments_count": pending_payments,
        "recent_payments": recent_payments,
    }


@router.get("/analytics/daily-active-users")
async def daily_active_users(
    days: int = Query(default=30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    """Distinct active users per day (union of chat + practice sessions)."""
    result = await db.execute(
        text("""
            SELECT day::date AS date, COUNT(DISTINCT user_id) AS active_users
            FROM (
                SELECT user_id, created_at AS day FROM chat_sessions
                UNION ALL
                SELECT user_id, created_at AS day FROM practice_sessions
            ) combined
            WHERE day >= CURRENT_DATE - :days * INTERVAL '1 day'
            GROUP BY day::date
            ORDER BY day::date ASC
        """),
        {"days": days},
    )
    return [{"date": str(row.date), "active_users": row.active_users} for row in result]


@router.get("/analytics/subject-usage")
async def subject_usage(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    """Chat and practice session counts per subject."""
    result = await db.execute(
        text("""
            SELECT subject,
                   SUM(CASE WHEN source = 'chat' THEN 1 ELSE 0 END)     AS chat_count,
                   SUM(CASE WHEN source = 'practice' THEN 1 ELSE 0 END) AS practice_count
            FROM (
                SELECT subject, 'chat' AS source FROM chat_sessions WHERE subject IS NOT NULL
                UNION ALL
                SELECT subject, 'practice' AS source FROM practice_sessions
            ) combined
            GROUP BY subject
            ORDER BY (chat_count + practice_count) DESC
        """)
    )
    return [
        {
            "subject": row.subject,
            "chat_count": row.chat_count,
            "practice_count": row.practice_count,
        }
        for row in result
    ]


@router.get("/analytics/mock-test-scores")
async def mock_test_scores(
    college_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    """Average mock test score (%) and attempt count, optionally filtered by college."""
    if college_id:
        result = await db.execute(
            text("""
                SELECT
                    college_id,
                    COUNT(*) AS attempts,
                    ROUND(
                        AVG(
                            CASE WHEN (score_data->>'total')::int > 0
                            THEN (score_data->>'correct')::float / (score_data->>'total')::float * 100
                            ELSE NULL END
                        )::numeric, 1
                    ) AS avg_score_pct
                FROM mock_sessions
                WHERE status = 'submitted'
                  AND score_data IS NOT NULL
                  AND college_id = :college_id
                GROUP BY college_id
            """),
            {"college_id": college_id},
        )
    else:
        result = await db.execute(
            text("""
                SELECT
                    COALESCE(college_id, 'custom') AS college_id,
                    COUNT(*) AS attempts,
                    ROUND(
                        AVG(
                            CASE WHEN (score_data->>'total')::int > 0
                            THEN (score_data->>'correct')::float / (score_data->>'total')::float * 100
                            ELSE NULL END
                        )::numeric, 1
                    ) AS avg_score_pct
                FROM mock_sessions
                WHERE status = 'submitted'
                  AND score_data IS NOT NULL
                GROUP BY college_id
                ORDER BY attempts DESC
            """)
        )
    return [
        {
            "college_id": row.college_id,
            "attempts": row.attempts,
            "avg_score_pct": float(row.avg_score_pct) if row.avg_score_pct is not None else None,
        }
        for row in result
    ]


@router.get("/analytics/retention")
async def retention(
    days: int = Query(default=30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(_admin_only),
):
    """
    Week-1 retention: users registered in a week who had at least one session
    in the following week. Returns one row per cohort week.
    """
    result = await db.execute(
        text("""
            WITH cohorts AS (
                SELECT
                    id AS user_id,
                    DATE_TRUNC('week', created_at)::date AS reg_week
                FROM users
                WHERE created_at >= CURRENT_DATE - :days * INTERVAL '1 day'
            ),
            activity AS (
                SELECT user_id, created_at AS ts FROM chat_sessions
                UNION ALL
                SELECT user_id, created_at AS ts FROM practice_sessions
            )
            SELECT
                c.reg_week,
                COUNT(DISTINCT c.user_id) AS cohort_size,
                COUNT(DISTINCT a.user_id) AS retained
            FROM cohorts c
            LEFT JOIN activity a
                ON  a.user_id = c.user_id
                AND a.ts >= c.reg_week + INTERVAL '7 days'
                AND a.ts <  c.reg_week + INTERVAL '14 days'
            GROUP BY c.reg_week
            ORDER BY c.reg_week ASC
        """),
        {"days": days},
    )
    return [
        {
            "cohort_week": str(row.reg_week),
            "cohort_size": row.cohort_size,
            "retained": row.retained,
            "retention_pct": (
                round(row.retained / row.cohort_size * 100, 1) if row.cohort_size > 0 else 0.0
            ),
        }
        for row in result
    ]
