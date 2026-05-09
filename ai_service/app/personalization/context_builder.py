"""
Assembles personalization context strings injected into agent system prompts.

Four context types:
  build_tutor_context      — for subject tutor agent (smart RAG gating via classifier)
  build_capsule_context    — for daily capsule agent
  build_consultant_context — for consultant agent
  build_personalization_context — raw data for worker/personalization agent
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, UTC

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import redis_client
from app.config import settings
from app.models.personalization import SessionMemory
from app.personalization import summary_manager
from app.personalization.context_classifier import classify_tutor_query, classify_consultant_query
from app.rag import retriever
from app.subject_structure.loader import get_structure

_PROFILE_TTL = 300  # 5 min

logger = logging.getLogger(__name__)

_ALL_SUBJECTS = [
    "compulsory_math",
    "optional_math",
    "compulsory_english",
    "compulsory_science",
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

def _build_chapter_syllabus(subject: str, chapter: str | None) -> str:
    if not chapter:
        return ""
    try:
        structure = get_structure(subject)
        chapters = structure.get("chapters", [])
        match = next(
            (c for c in chapters if c.get("id") == chapter or c.get("display_name") == chapter),
            None,
        )
        if match:
            lines = [f"## Chapter Syllabus: {match.get('display_name', chapter)}"]
            for topic in match.get("topics", []):
                line = f"- {topic.get('display_name', '')}"
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


# ---------------------------------------------------------------------------
# build_tutor_context
# ---------------------------------------------------------------------------

async def build_tutor_context(
    db: AsyncSession,
    user_id: str,
    subject: str,
    message: str,
    chapter: str | None = None,
    student_stream: str = "both",
) -> tuple[str, str]:
    """
    Returns (context_string, student_stream).

    All independent fetches (profile, summaries, classifier) run in parallel via asyncio.gather.
    Profile is only fetched when the overall summary doesn't exist yet (new-user fallback).

    Context layout — static first for prompt cache hits:
      needs_rag=False: chapter_syllabus --- overall + all_time + yesterday + timeline
      needs_rag=True:  rag_chunks + chapter_syllabus --- overall + all_time + weekly + yesterday + timeline
    """
    # Classifier (OpenAI API, no DB) fires concurrently while cache + timeline are fetched
    classify_task = asyncio.create_task(classify_tutor_query(message, subject, chapter))

    # Cache: overall + this subject only (not all 4) — 1 Redis GET, 4 DB queries on miss
    summaries = await summary_manager.get_subject_summaries_cached(db, user_id, subject)
    # Timeline always fresh — consultant can update it mid-session
    timeline_row = await summary_manager.get_consultant_timeline(db, user_id)

    classification = await classify_task

    overall = summaries["overall"]
    all_time = summaries.get("all_time", _NO_SUMMARY)
    weekly = summaries.get("weekly", _NO_SUMMARY)
    daily_prev = summaries.get("daily_prev", _NO_SUMMARY)
    timeline_section = timeline_row.content if timeline_row else "[No preparation timeline yet]"

    # Only fetch profile if no summary yet (new user — rare path)
    if overall == _NO_SUMMARY:
        profile_data = await _fetch_profile(user_id)
        profile_section, student_stream = _format_profile(profile_data)
        student_context_section = profile_section
    else:
        student_context_section = f"## Overall Student Summary\n{overall}"

    needs_rag: bool = classification["needs_rag"]
    rag_chapter: str | None = classification.get("chapter") or chapter
    rag_topic: str | None = classification.get("topic")

    # --- Static section (same for all students on the same topic) ---
    static_parts: list[str] = []

    if needs_rag:
        chunks = await retriever.retrieve(
            query=message,
            subject=subject,
            chapter=rag_chapter,
            topic=rag_topic,
            top_k=4,
        )
        rag_block = _format_rag_chunks(chunks)
        if rag_block:
            static_parts.append(rag_block)

    chapter_syllabus = _build_chapter_syllabus(subject, chapter or rag_chapter)
    if chapter_syllabus:
        static_parts.append(chapter_syllabus)

    # --- Dynamic section (student-specific) ---
    dynamic_parts: list[str] = [student_context_section]
    dynamic_parts.append(f"## {_subject_display(subject)} — All-Time Summary\n{all_time}")
    if needs_rag:
        dynamic_parts.append(f"## {_subject_display(subject)} — Weekly Summary\n{weekly}")
    dynamic_parts.append(f"## {_subject_display(subject)} — Yesterday's Summary\n{daily_prev}")
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
    Static: RAG chunks for chapters studied/practiced today.
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
    today_midnight = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    stmt = (
        select(SessionMemory)
        .where(
            SessionMemory.user_id == user_id,
            SessionMemory.subject == subject,
            SessionMemory.generated_at >= today_midnight,
        )
    )
    mem_result = await db.execute(stmt)
    today_memories = mem_result.scalars().all()

    # Fetch RAG chunks for chapters studied today (cap at 3 chapters)
    all_chunks: list[dict] = []
    if chapters_today:
        capped_chapters = list(chapters_today)[:3]
        chunks_per_chapter = max(1, 6 // len(capped_chapters))
        for ch in capped_chapters:
            try:
                structure = get_structure(subject)
                match = next(
                    (c for c in structure.get("chapters", []) if c.get("id") == ch),
                    None,
                )
                display = match.get("display_name", ch) if match else ch
                chunks = await retriever.retrieve(
                    query=f"key concepts for {display}",
                    subject=subject,
                    chapter=ch,
                    top_k=chunks_per_chapter,
                )
                all_chunks.extend(chunks)
            except Exception as exc:
                logger.warning("Capsule RAG fetch failed for chapter=%s: %s", ch, exc)

    # Static section
    static_parts: list[str] = []
    rag_block = _format_rag_chunks(all_chunks)
    if rag_block:
        static_parts.append(rag_block)

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

async def _noop_general() -> dict:
    return {"query_type": "general"}


async def build_consultant_context(
    db: AsyncSession,
    user_id: str,
    message: str = "",
) -> str:
    """Context for the consultant agent.

    Classifier + always-needed data (overall summary + timeline) run in parallel.
    If student_performance, the full subject batch also runs in a single gather.

    student_performance → full context (overall + all subject summaries + practice + memories + timeline)
    general             → lean context (overall + timeline only)
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

    classify_coro = classify_consultant_query(message) if message else _noop_general()
    classify_task = asyncio.create_task(classify_coro)

    # Overall always needed; cache: 1 Redis GET, 1 DB query on miss
    overall = await summary_manager.get_overall_cached(db, user_id)
    # Timeline always fresh — consultant can update it mid-session
    timeline_row = await summary_manager.get_consultant_timeline(db, user_id)

    classification = await classify_task
    query_type = classification["query_type"]

    timeline_section = timeline_row.content if timeline_row else "[No preparation timeline yet]"

    if overall == _NO_SUMMARY:
        profile_data = await _fetch_profile(user_id)
        profile_section, _ = _format_profile(profile_data)
        student_context_section = profile_section
    else:
        student_context_section = f"## Overall Student Summary\n{overall}"

    if query_type != "student_performance":
        return f"""{student_context_section}

## Preparation Timeline
{timeline_section}"""

    # Full context — fetch all 4 subjects from cache (1 Redis GET, 13 DB queries on miss)
    all_summaries = await summary_manager.get_all_subjects_summaries_cached(db, user_id)
    subj_cache = all_summaries["subjects"]
    # Practice and memories always fresh — change as the student works through the day
    practice_rows = await summary_manager.get_today_practice_summaries(db, user_id)
    mem_result = await db.execute(memory_stmt)

    subject_values = [
        ("compulsory_math", subj_cache.get("compulsory_math", {})),
        ("optional_math", subj_cache.get("optional_math", {})),
        ("compulsory_english", subj_cache.get("compulsory_english", {})),
        ("compulsory_science", subj_cache.get("compulsory_science", {})),
    ]
    subject_sections = [
        f"### {_subject_display(subj)}\n**All-Time:** {d.get('all_time', _NO_SUMMARY)}\n\n**Weekly:** {d.get('weekly', _NO_SUMMARY)}"
        for subj, d in subject_values
    ]

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
{"".join(subject_sections)}

{practice_section}

{memory_section}

## Preparation Timeline
{timeline_section}"""


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
