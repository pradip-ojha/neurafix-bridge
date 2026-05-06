"""
Assembles the full personalization context string injected into every agent's system prompt.

Sources:
  1. Student profile  — fetched from main_backend internal endpoint
  2. Personalization summaries — from local DB (populated by worker in Phase 7)
  3. Planner timeline — from local DB (populated by planner agent in Phase 5)
"""
from __future__ import annotations

import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.personalization import PersonalizationSummary, PlannerTimeline

logger = logging.getLogger(__name__)

_TIMELINE_ORDER = ["all_time", "monthly", "weekly", "fifteen_day", "daily"]
_TIMELINE_LABELS = {
    "all_time": "All-Time Summary",
    "monthly": "Monthly Summary",
    "weekly": "Weekly Summary",
    "fifteen_day": "15-Day Summary",
    "daily": "Today's Summary",
}


async def _fetch_profile(user_id: str) -> dict:
    """Fetch student profile from main_backend. Returns empty dict on failure."""
    url = f"{settings.MAIN_BACKEND_URL}/api/internal/profile/{user_id}"
    headers = {"X-Internal-Secret": settings.MAIN_BACKEND_INTERNAL_SECRET}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                return resp.json()
    except Exception as exc:
        logger.warning("Failed to fetch profile for user_id=%s: %s", user_id, exc)
    return {}


def _format_profile_section(profile_data: dict) -> str:
    user = profile_data.get("user", {})
    sp = profile_data.get("student_profile") or {}

    name = user.get("full_name") or "Unknown"
    stream = sp.get("stream") or "Not set"
    school = sp.get("school_name") or "Not provided"
    see_gpa = sp.get("see_gpa")
    class_10 = sp.get("class_10_scores")
    class_9 = sp.get("class_9_scores")
    class_8 = sp.get("class_8_scores")

    lines = [
        "## Student Profile",
        f"Name: {name}",
        f"Stream: {stream}",
        f"School: {school}",
        f"SEE GPA: {see_gpa if see_gpa is not None else 'Not provided'}",
    ]
    if class_10:
        lines.append(f"Class 10 Scores: {class_10}")
    if class_9:
        lines.append(f"Class 9 Scores: {class_9}")
    if class_8:
        lines.append(f"Class 8 Scores: {class_8}")
    return "\n".join(lines)


def _format_summaries_section(summaries: list[PersonalizationSummary], agent_type: str) -> str:
    by_timeline = {s.timeline: s.content for s in summaries if s.agent_type == agent_type}
    lines = [f"## Your Knowledge of This Student ({agent_type.title()} Agent)"]
    for key in _TIMELINE_ORDER:
        label = _TIMELINE_LABELS[key]
        content = by_timeline.get(key, "Not yet generated.")
        lines.append(f"\n### {label}\n{content}")
    return "\n".join(lines)


def _format_planner_section(planner_summaries: list[PersonalizationSummary], timeline: PlannerTimeline | None) -> str:
    planner_all_time = next(
        (s.content for s in planner_summaries if s.agent_type == "planner" and s.timeline == "all_time"),
        "Planner has not yet assessed this student.",
    )
    plan_content = timeline.content if timeline else "No plan created yet. Encourage the student to chat with the Planner agent first."
    return (
        f"## Planner's Assessment\n{planner_all_time}\n\n"
        f"## Preparation Plan\n{plan_content}"
    )


async def build_context(db: AsyncSession, user_id: str, subject: str) -> tuple[str, str]:
    """
    Returns (context_string, student_stream).
    student_stream is used to scope Pinecone retrieval.
    """
    profile_data = await _fetch_profile(user_id)
    student_stream = (profile_data.get("student_profile") or {}).get("stream") or "both"

    # Fetch all summaries for this user and subject (includes planner rows with subject=None)
    stmt = select(PersonalizationSummary).where(
        PersonalizationSummary.user_id == user_id,
    ).where(
        (PersonalizationSummary.subject == subject) | (PersonalizationSummary.subject == None)  # noqa: E711
    )
    result = await db.execute(stmt)
    summaries = list(result.scalars().all())

    planner_summaries = [s for s in summaries if s.agent_type == "planner"]
    tutor_summaries = [s for s in summaries if s.agent_type == "tutor" and s.subject == subject]

    stmt_timeline = select(PlannerTimeline).where(PlannerTimeline.user_id == user_id)
    timeline_result = await db.execute(stmt_timeline)
    planner_timeline = timeline_result.scalar_one_or_none()

    profile_section = _format_profile_section(profile_data)
    tutor_section = _format_summaries_section(tutor_summaries, "tutor")
    planner_section = _format_planner_section(planner_summaries, planner_timeline)

    context = f"{profile_section}\n\n{tutor_section}\n\n{planner_section}"
    return context, student_stream
