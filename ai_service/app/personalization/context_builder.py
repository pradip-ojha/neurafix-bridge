"""
Assembles personalization context strings injected into agent system prompts.

Four context types:
  build_tutor_context      — for subject tutor agent
  build_capsule_context    — for daily capsule agent
  build_consultant_context — for consultant agent
  build_personalization_context — raw data for worker/personalization agent
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, UTC

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.personalization import PracticeSessionSummary, SessionMemory, SubjectSummary
from app.personalization import summary_manager
from app.subject_structure.loader import get_structure

logger = logging.getLogger(__name__)

_ALL_SUBJECTS = [
    "compulsory_math",
    "optional_math",
    "compulsory_english",
    "compulsory_science",
]


# ---------------------------------------------------------------------------
# Profile fetching (shared)
# ---------------------------------------------------------------------------

async def _fetch_profile(user_id: str) -> dict:
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


def _format_profile(profile_data: dict) -> tuple[str, str]:
    """Returns (formatted_profile_section, student_stream)."""
    user = profile_data.get("user", {})
    sp = profile_data.get("student_profile") or {}

    name = user.get("full_name") or "Unknown"
    stream = sp.get("stream") or "both"
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
    return "\n".join(lines), stream


def _subject_display(subject: str) -> str:
    return subject.replace("_", " ").title()


# ---------------------------------------------------------------------------
# build_tutor_context
# ---------------------------------------------------------------------------

async def build_tutor_context(
    db: AsyncSession,
    user_id: str,
    subject: str,
    chapter: str | None = None,
) -> tuple[str, str]:
    """
    Returns (context_string, student_stream).
    student_stream is used to scope Pinecone retrieval.
    """
    profile_data = await _fetch_profile(user_id)
    profile_section, student_stream = _format_profile(profile_data)

    overall = await summary_manager.get_or_placeholder_overall(db, user_id)
    all_time = await summary_manager.get_or_placeholder(db, user_id, subject, "all_time")
    weekly = await summary_manager.get_or_placeholder(db, user_id, subject, "weekly")

    yesterday = (datetime.now(UTC) - timedelta(days=1)).date()
    daily_prev = await summary_manager.get_or_placeholder(db, user_id, subject, "daily", summary_date=yesterday)

    timeline = await summary_manager.get_consultant_timeline(db, user_id)
    timeline_section = timeline.content if timeline else "[No preparation timeline yet]"

    chapter_syllabus = ""
    if chapter:
        try:
            structure = get_structure(subject)
            chapters = structure.get("chapters", [])
            match = next((c for c in chapters if c.get("id") == chapter or c.get("display_name") == chapter), None)
            if match:
                chapter_syllabus = f"\n\n## Chapter Syllabus: {match.get('display_name', chapter)}\n"
                for topic in match.get("topics", []):
                    chapter_syllabus += f"- {topic.get('display_name', '')}"
                    subtopics = topic.get("subtopics", [])
                    if subtopics:
                        chapter_syllabus += ": " + ", ".join(subtopics)
                    chapter_syllabus += "\n"
        except Exception as exc:
            logger.warning("Could not load chapter syllabus for subject=%s chapter=%s: %s", subject, chapter, exc)

    context = f"""{profile_section}

## Overall Student Summary
{overall}

## {_subject_display(subject)} — All-Time Summary
{all_time}

## {_subject_display(subject)} — Weekly Summary
{weekly}

## {_subject_display(subject)} — Yesterday's Summary
{daily_prev}

## Preparation Timeline
{timeline_section}{chapter_syllabus}"""

    return context, student_stream


# ---------------------------------------------------------------------------
# build_capsule_context
# ---------------------------------------------------------------------------

async def build_capsule_context(
    db: AsyncSession,
    user_id: str,
    subject: str,
) -> tuple[str, str]:
    """
    Same as tutor context but uses TODAY's daily summary (capsule is generated after day ends).
    Returns (context_string, student_stream).
    """
    profile_data = await _fetch_profile(user_id)
    profile_section, student_stream = _format_profile(profile_data)

    overall = await summary_manager.get_or_placeholder_overall(db, user_id)
    all_time = await summary_manager.get_or_placeholder(db, user_id, subject, "all_time")
    weekly = await summary_manager.get_or_placeholder(db, user_id, subject, "weekly")

    today = datetime.now(UTC).date()
    daily_today = await summary_manager.get_or_placeholder(db, user_id, subject, "daily", summary_date=today)

    timeline = await summary_manager.get_consultant_timeline(db, user_id)
    timeline_section = timeline.content if timeline else "[No preparation timeline yet]"

    context = f"""{profile_section}

## Overall Student Summary
{overall}

## {_subject_display(subject)} — All-Time Summary
{all_time}

## {_subject_display(subject)} — Weekly Summary
{weekly}

## {_subject_display(subject)} — Today's Summary
{daily_today}

## Preparation Timeline
{timeline_section}"""

    return context, student_stream


# ---------------------------------------------------------------------------
# build_consultant_context
# ---------------------------------------------------------------------------

async def build_consultant_context(
    db: AsyncSession,
    user_id: str,
) -> str:
    """Context for the consultant agent."""
    profile_data = await _fetch_profile(user_id)
    profile_section, _ = _format_profile(profile_data)

    overall = await summary_manager.get_or_placeholder_overall(db, user_id)

    subject_sections = []
    for subj in _ALL_SUBJECTS:
        all_time = await summary_manager.get_or_placeholder(db, user_id, subj, "all_time")
        weekly = await summary_manager.get_or_placeholder(db, user_id, subj, "weekly")
        subject_sections.append(
            f"### {_subject_display(subj)}\n"
            f"**All-Time:** {all_time}\n\n"
            f"**Weekly:** {weekly}"
        )

    timeline = await summary_manager.get_consultant_timeline(db, user_id)
    timeline_section = timeline.content if timeline else "[No preparation timeline yet]"

    # Today's practice summaries (all subjects)
    practice_rows = await summary_manager.get_today_practice_summaries(db, user_id)
    practice_section = ""
    if practice_rows:
        practice_section = "\n\n## Today's Practice Sessions\n"
        for p in practice_rows:
            practice_section += (
                f"- {_subject_display(p.subject)} / {p.chapter}: "
                f"{p.correct_count}/{p.total_questions} correct — {p.summary_content}\n"
            )
    else:
        practice_section = "\n\n## Today's Practice Sessions\n[No practice sessions today]"

    # Today's session memories
    today_midnight = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    stmt = (
        select(SessionMemory)
        .where(
            SessionMemory.user_id == user_id,
            SessionMemory.generated_at >= today_midnight,
        )
        .order_by(SessionMemory.generated_at.asc())
    )
    result = await db.execute(stmt)
    memories = result.scalars().all()
    memory_section = ""
    if memories:
        memory_section = "\n\n## Today's Tutor Session Memories\n"
        for m in memories:
            subj_label = _subject_display(m.subject) if m.subject else "General"
            memory_section += f"### {subj_label}\n{m.content}\n\n"
    else:
        memory_section = "\n\n## Today's Tutor Session Memories\n[No tutor sessions today]"

    context = f"""{profile_section}

## Overall Student Summary
{overall}

## Subject Summaries
{"".join(subject_sections)}{practice_section}{memory_section}

## Preparation Timeline
{timeline_section}"""

    return context


# ---------------------------------------------------------------------------
# build_personalization_context
# ---------------------------------------------------------------------------

async def build_personalization_context(
    db: AsyncSession,
    user_id: str,
) -> dict:
    """
    Returns raw data dict for the worker's personalization agent.
    Includes all summaries, session memories, and practice data for the day.
    """
    profile_data = await _fetch_profile(user_id)

    overall = await summary_manager.get_or_placeholder_overall(db, user_id)

    subject_data = {}
    for subj in _ALL_SUBJECTS:
        all_time = await summary_manager.get_or_placeholder(db, user_id, subj, "all_time")
        weekly = await summary_manager.get_or_placeholder(db, user_id, subj, "weekly")
        daily_list = await summary_manager.get_last_n_daily_summaries(db, user_id, subj, n=7)
        subject_data[subj] = {
            "all_time": all_time,
            "weekly": weekly,
            "recent_daily": [{"date": str(s.summary_date), "content": s.content} for s in daily_list],
        }

    # All session memories
    stmt = (
        select(SessionMemory)
        .where(SessionMemory.user_id == user_id)
        .order_by(SessionMemory.generated_at.desc())
        .limit(20)
    )
    result = await db.execute(stmt)
    memories = [
        {"session_id": m.session_id, "subject": m.subject, "content": m.content, "generated_at": m.generated_at.isoformat()}
        for m in result.scalars().all()
    ]

    today_practice = await summary_manager.get_today_practice_summaries(db, user_id)
    practice_data = [
        {
            "subject": p.subject,
            "chapter": p.chapter,
            "total": p.total_questions,
            "correct": p.correct_count,
            "incorrect": p.incorrect_count,
            "topic_breakdown": p.topic_breakdown,
            "summary": p.summary_content,
        }
        for p in today_practice
    ]

    timeline = await summary_manager.get_consultant_timeline(db, user_id)

    return {
        "user_id": user_id,
        "profile": profile_data,
        "overall_summary": overall,
        "subject_summaries": subject_data,
        "session_memories": memories,
        "today_practice_sessions": practice_data,
        "consultant_timeline": timeline.content if timeline else None,
    }
