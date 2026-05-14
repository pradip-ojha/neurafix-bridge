"""
Assembles personalization context strings injected into agent system prompts.

Four context types:
  build_tutor_context      — for subject tutor agent (explicit student-selected mode)
  build_capsule_context    — for daily capsule agent
  build_consultant_context — for consultant agent
  build_personalization_context — raw data for worker/personalization agent
"""
from __future__ import annotations

import logging
from datetime import datetime, UTC

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import redis_client
from app.config import settings
from app.models.personalization import SessionMemory
from app.personalization import summary_manager
from app.rag import retriever
from app.subject_structure.loader import get_chapter_names, get_chapter_structure

_PROFILE_TTL = 300  # 5 min

logger = logging.getLogger(__name__)

_ALL_SUBJECTS = [
    "mathematics",
    "optional_math",
    "english",
    "science",
]

_NO_SUMMARY = "[No summary yet]"


# ---------------------------------------------------------------------------
# Profile fetching (shared)
# ---------------------------------------------------------------------------

async def _fetch_profile(user_id: str) -> dict:
    cache_key = f"profile:{user_id}"

    # Try Redis cache first
    try:
        cached = await redis_client.get_json(cache_key)
        if cached is not None:
            return cached
    except Exception:
        pass

    url = f"{settings.MAIN_BACKEND_URL}/api/internal/profile/{user_id}"
    headers = {"X-Internal-Secret": settings.MAIN_BACKEND_INTERNAL_SECRET}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                try:
                    await redis_client.set_json(cache_key, data, ex=_PROFILE_TTL)
                except Exception:
                    pass
                return data
    except Exception as exc:
        logger.warning("Failed to fetch profile for user_id=%s: %s", user_id, exc)

    # Fall back to stale cache if main_backend unreachable
    try:
        stale = await redis_client.get_json(cache_key)
        if stale is not None:
            return stale
    except Exception:
        pass

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
# Helpers
# ---------------------------------------------------------------------------

async def _build_chapter_syllabus(subject: str, chapter: str | None) -> str:
    if not chapter:
        return ""
    try:
        structure = await get_chapter_structure(subject, chapter)
        lines = [f"## Chapter Syllabus: {structure.get('display_name', chapter)}"]
        for topic in structure.get("topics", []):
            topic_name = topic.get("topic") or topic.get("id") or ""
            line = f"- {topic_name}"
            subtopics = topic.get("subtopics", [])
            if subtopics:
                line += ": " + ", ".join(subtopics)
            lines.append(line)
        return "\n".join(lines)
    except Exception as exc:
        logger.warning("Could not load chapter syllabus for subject=%s chapter=%s: %s", subject, chapter, exc)
    return ""


def _format_rag_chunks(chunks: list[dict]) -> str:
    if not chunks:
        return ""
    parts = []
    for c in chunks:
        header = f"Chapter: {c['chapter']} | Topic: {c['topic']}"
        if c.get("subtopic"):
            header += f" | Subtopic: {c['subtopic']}"
        header += f" | Type: {c['chunk_type']}"
        parts.append(f"{header}\n{c['text']}")
    return "## Knowledge Base Notes\n" + "\n---\n".join(parts)


async def _build_subject_chapter_names() -> str:
    sections = []
    for subject in _ALL_SUBJECTS:
        try:
            names = await get_chapter_names(subject)
        except Exception as exc:
            logger.warning("Could not load chapter names for subject=%s: %s", subject, exc)
            names = []
        if names:
            chapter_list = ", ".join(item.get("display_name") or item.get("chapter_id", "") for item in names)
        else:
            chapter_list = "[No chapters configured]"
        sections.append(f"### {_subject_display(subject)}\n{chapter_list}")
    return "## Subject Chapter Names\n" + "\n\n".join(sections)


# ---------------------------------------------------------------------------
# build_tutor_context
# ---------------------------------------------------------------------------

async def build_tutor_context(
    db: AsyncSession,
    user_id: str,
    subject: str,
    message: str,
    chapter: str,
    mode: str = "fast",
    student_stream: str = "both",
) -> tuple[str, str]:
    """
    Returns (context_string, student_stream).

    Fast mode: chapter syllabus + overall summary + yesterday's daily summary.
    Thinking mode: fast context + all-time summary + weekly summary + timeline.
    Deep Thinking mode: thinking context + RAG chunks for the selected chapter.
    """
    # Cache: overall + this subject only (not all 4) — 1 Redis GET, 4 DB queries on miss
    summaries = await summary_manager.get_subject_summaries_cached(db, user_id, subject)

    overall = summaries["overall"]
    all_time = summaries.get("all_time", _NO_SUMMARY)
    weekly = summaries.get("weekly", _NO_SUMMARY)
    daily_prev = summaries.get("daily_prev", _NO_SUMMARY)

    # Only fetch profile if no summary yet (new user — rare path)
    if overall == _NO_SUMMARY:
        profile_data = await _fetch_profile(user_id)
        profile_section, student_stream = _format_profile(profile_data)
        student_context_section = profile_section
    else:
        student_context_section = f"## Overall Student Summary\n{overall}"

    # --- Static section (same for all students on the same topic) ---
    static_parts: list[str] = []

    if mode == "deep_thinking":
        chunks = await retriever.retrieve(
            query=message,
            subject=subject,
            chapter=chapter,
            topic=None,
            top_k=4,
        )
        rag_block = _format_rag_chunks(chunks)
        if rag_block:
            static_parts.append(rag_block)

    chapter_syllabus = await _build_chapter_syllabus(subject, chapter)
    if chapter_syllabus:
        static_parts.append(chapter_syllabus)

    # --- Dynamic section (student-specific) ---
    dynamic_parts: list[str] = [student_context_section]
    if mode in ("thinking", "deep_thinking"):
        timeline_row = await summary_manager.get_consultant_timeline(db, user_id)
        timeline_section = timeline_row.content if timeline_row else "[No preparation timeline yet]"
        dynamic_parts.append(f"## {_subject_display(subject)} — All-Time Summary\n{all_time}")
        dynamic_parts.append(f"## {_subject_display(subject)} — Weekly Summary\n{weekly}")
    dynamic_parts.append(f"## {_subject_display(subject)} — Yesterday's Summary\n{daily_prev}")
    if mode in ("thinking", "deep_thinking"):
        dynamic_parts.append(f"## Preparation Timeline\n{timeline_section}")

    static_block = "\n\n".join(static_parts)
    dynamic_block = "\n\n".join(dynamic_parts)

    if static_block:
        context = f"{static_block}\n\n---\n\n{dynamic_block}"
    else:
        context = dynamic_block

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
    Context for daily capsule agent.
    Static: chapter syllabi for chapters practiced today.
    Dynamic: overall summary + weekly + today's daily + today's practice + timeline.
    Returns (context_string, student_stream).
    """
    # Cache: overall + this subject only — same key as tutor uses for the same subject
    summaries = await summary_manager.get_subject_summaries_cached(db, user_id, subject)
    overall = summaries["overall"]
    weekly = summaries.get("weekly", _NO_SUMMARY)

    if overall == _NO_SUMMARY:
        profile_data = await _fetch_profile(user_id)
        profile_section, student_stream = _format_profile(profile_data)
        student_context_section = profile_section
    else:
        student_context_section = f"## Overall Student Summary\n{overall}"
        student_stream = "both"

    # Dynamic data fetched fresh
    today = datetime.now(UTC).date()
    daily_today = await summary_manager.get_or_placeholder(db, user_id, subject, "daily", summary_date=today)
    timeline = await summary_manager.get_consultant_timeline(db, user_id)
    timeline_section = timeline.content if timeline else "[No preparation timeline yet]"

    # Today's practice sessions for this subject
    today_practice = await summary_manager.get_today_practice_summaries(db, user_id, subject)

    # Collect chapters studied today
    chapters_today: set[str] = {p.chapter for p in today_practice if p.chapter}

    # Fetch chapter syllabi for chapters practiced today.
    syllabus_sections: list[str] = []
    if chapters_today:
        for ch in sorted(chapters_today):
            try:
                syllabus = await _build_chapter_syllabus(subject, ch)
                if syllabus:
                    syllabus_sections.append(syllabus)
            except Exception as exc:
                logger.warning("Capsule chapter syllabus fetch failed for chapter=%s: %s", ch, exc)

    # Static section
    static_parts: list[str] = syllabus_sections

    # Dynamic section
    practice_lines = []
    for p in today_practice:
        practice_lines.append(
            f"- {_subject_display(p.subject)} / {p.chapter}: "
            f"{p.correct_count}/{p.total_questions} correct — {p.summary_content}"
        )
    practice_section = (
        "## Today's Practice Sessions\n" + "\n".join(practice_lines)
        if practice_lines
        else "## Today's Practice Sessions\n[No practice sessions today]"
    )

    dynamic_parts: list[str] = [
        student_context_section,
        f"## {_subject_display(subject)} — Weekly Summary\n{weekly}",
        f"## {_subject_display(subject)} — Today's Summary\n{daily_today}",
        practice_section,
        f"## Preparation Timeline\n{timeline_section}",
    ]

    static_block = "\n\n".join(static_parts)
    dynamic_block = "\n\n".join(dynamic_parts)

    if static_block:
        context = f"{static_block}\n\n---\n\n{dynamic_block}"
    else:
        context = dynamic_block

    return context, student_stream


# ---------------------------------------------------------------------------
# build_consultant_context
# ---------------------------------------------------------------------------

async def build_consultant_context(
    db: AsyncSession,
    user_id: str,
    mode: str = "normal",
) -> str:
    """Context for the consultant agent.

    Normal: overall summary + timeline + chapter names only.
    Thinking: normal context + subject summaries + today's practice + tutor memories.
    """
    today_midnight = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    memory_stmt = (
        select(SessionMemory)
        .where(
            SessionMemory.user_id == user_id,
            SessionMemory.generated_at >= today_midnight,
        )
        .order_by(SessionMemory.generated_at.asc())
    )

    # Overall always needed; cache: 1 Redis GET, 1 DB query on miss
    overall = await summary_manager.get_overall_cached(db, user_id)
    # Timeline always fresh — consultant can update it mid-session
    timeline_row = await summary_manager.get_consultant_timeline(db, user_id)

    timeline_section = timeline_row.content if timeline_row else "[No preparation timeline yet]"
    chapter_names_section = await _build_subject_chapter_names()

    if overall == _NO_SUMMARY:
        profile_data = await _fetch_profile(user_id)
        profile_section, _ = _format_profile(profile_data)
        student_context_section = profile_section
    else:
        student_context_section = f"## Overall Student Summary\n{overall}"

    if mode != "thinking":
        return f"""{student_context_section}

## Preparation Timeline
{timeline_section}

{chapter_names_section}"""

    # Full context — fetch all 4 subjects from cache (1 Redis GET, 13 DB queries on miss)
    all_summaries = await summary_manager.get_all_subjects_summaries_cached(db, user_id)
    subj_cache = all_summaries["subjects"]
    # Practice and memories always fresh — change as the student works through the day
    practice_rows = await summary_manager.get_today_practice_summaries(db, user_id)
    mem_result = await db.execute(memory_stmt)

    subject_values = [
        ("mathematics", subj_cache.get("mathematics", {})),
        ("optional_math", subj_cache.get("optional_math", {})),
        ("english", subj_cache.get("english", {})),
        ("science", subj_cache.get("science", {})),
    ]
    subject_sections = [
        f"### {_subject_display(subj)}\n**All-Time:** {d.get('all_time', _NO_SUMMARY)}\n\n**Weekly:** {d.get('weekly', _NO_SUMMARY)}"
        for subj, d in subject_values
    ]
    subject_summary_section = "\n\n".join(subject_sections)

    if practice_rows:
        practice_lines = [
            f"- {_subject_display(p.subject)} / {p.chapter}: "
            f"{p.correct_count}/{p.total_questions} correct — {p.summary_content}"
            for p in practice_rows
        ]
        practice_section = "## Today's Practice Sessions\n" + "\n".join(practice_lines)
    else:
        practice_section = "## Today's Practice Sessions\n[No practice sessions today]"

    memories = mem_result.scalars().all()
    if memories:
        mem_lines = [
            f"### {_subject_display(m.subject) if m.subject else 'General'}\n{m.content}"
            for m in memories
        ]
        memory_section = "## Today's Tutor Session Memories\n" + "\n\n".join(mem_lines)
    else:
        memory_section = "## Today's Tutor Session Memories\n[No tutor sessions today]"

    return f"""{student_context_section}

## Subject Summaries
{subject_summary_section}

{practice_section}

{memory_section}

## Preparation Timeline
{timeline_section}

{chapter_names_section}"""


async def build_capsule_followup_context(
    db: AsyncSession,
    user_id: str,
) -> str:
    """Minimal context for daily capsule follow-up chat."""
    overall = await summary_manager.get_overall_cached(db, user_id)
    if overall == _NO_SUMMARY:
        profile_data = await _fetch_profile(user_id)
        profile_section, _ = _format_profile(profile_data)
        return profile_section
    return f"## Overall Student Summary\n{overall}"


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

    stmt = (
        select(SessionMemory)
        .where(SessionMemory.user_id == user_id)
        .order_by(SessionMemory.generated_at.desc())
        .limit(20)
    )
    result = await db.execute(stmt)
    memories = [
        {
            "session_id": m.session_id,
            "subject": m.subject,
            "content": m.content,
            "generated_at": m.generated_at.isoformat(),
        }
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
