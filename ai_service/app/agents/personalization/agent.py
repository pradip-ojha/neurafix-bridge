"""
Personalization agent — called internally by worker jobs, not by students.

All functions are async and write directly to the database.
"""
from __future__ import annotations

import logging
from datetime import datetime, date, UTC

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.model_router import ROLES, get_azure_client
from app.config import settings
from app.models.chat_session import ChatMessage, ChatSession
from app.models.personalization import AgentType, StudentLevel
from app.personalization import summary_manager

logger = logging.getLogger(__name__)

_ALL_SUBJECTS = [
    "compulsory_math",
    "optional_math",
    "compulsory_english",
    "compulsory_science",
]


def _subject_display(subject: str) -> str:
    return subject.replace("_", " ").title()


async def _llm(system: str, user: str) -> str:
    client = get_azure_client()
    resp = await client.chat.completions.create(
        model=ROLES["personalization"],
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.3,
    )
    return resp.choices[0].message.content or ""


async def _fetch_profile(user_id: str) -> dict:
    url = f"{settings.MAIN_BACKEND_URL}/api/internal/profile/{user_id}"
    headers = {"X-Internal-Secret": settings.MAIN_BACKEND_INTERNAL_SECRET}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                return resp.json()
    except Exception as exc:
        logger.warning("Profile fetch failed for user_id=%s: %s", user_id, exc)
    return {}


# ---------------------------------------------------------------------------
# generate_daily_summary
# ---------------------------------------------------------------------------

async def generate_daily_summary(
    db: AsyncSession,
    user_id: str,
    subject: str,
    target_date: date,
) -> str:
    """Generate and save the daily summary for a specific student/subject/date."""
    practice_rows = await db.execute(
        select(summary_manager.PracticeSessionSummary).where(
            summary_manager.PracticeSessionSummary.user_id == user_id,
            summary_manager.PracticeSessionSummary.subject == subject,
            summary_manager.PracticeSessionSummary.session_date == target_date,
        )
    )
    practice_sessions = practice_rows.scalars().all()

    day_start = datetime.combine(target_date, datetime.min.time()).replace(tzinfo=UTC)
    day_end = datetime.combine(target_date, datetime.max.time()).replace(tzinfo=UTC)

    mem_rows = await db.execute(
        select(summary_manager.SessionMemory).where(
            summary_manager.SessionMemory.user_id == user_id,
            summary_manager.SessionMemory.subject == subject,
            summary_manager.SessionMemory.generated_at >= day_start,
            summary_manager.SessionMemory.generated_at <= day_end,
        )
    )
    memories = mem_rows.scalars().all()

    # Consultant chat messages from today (for cross-subject context)
    consultant_stmt = (
        select(ChatSession)
        .where(
            ChatSession.user_id == user_id,
            ChatSession.agent_type == AgentType.consultant,
            ChatSession.session_date == target_date,
        )
    )
    c_result = await db.execute(consultant_stmt)
    consultant_sessions = c_result.scalars().all()

    consultant_context = ""
    for cs in consultant_sessions:
        msg_rows = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == cs.id)
            .order_by(ChatMessage.created_at.asc())
            .limit(20)
        )
        msgs = msg_rows.scalars().all()
        if msgs:
            lines = [f"{m.role}: {m.content[:300]}" for m in msgs]
            consultant_context += "\n".join(lines) + "\n"

    practice_text = ""
    for p in practice_sessions:
        practice_text += (
            f"Chapter: {p.chapter} | Score: {p.correct_count}/{p.total_questions} correct\n"
            f"Summary: {p.summary_content}\n"
            f"Topic breakdown: {p.topic_breakdown}\n\n"
        )
    if not practice_text:
        practice_text = "[No practice sessions today]"

    memory_text = "\n\n".join(m.content for m in memories) if memories else "[No tutor sessions today]"

    system = (
        "You are the HamroGuru Personalization Agent. Generate a concise daily study summary "
        "for a student preparing for class 11 entrance exams. "
        "Output 4-6 sentences covering: topics studied today, practice performance, "
        "areas of confusion or difficulty, and any patterns observed. "
        "Be specific and factual — base everything on the data provided."
    )
    user_prompt = (
        f"Subject: {_subject_display(subject)}\n"
        f"Date: {target_date}\n\n"
        f"## Practice Sessions\n{practice_text}\n"
        f"## Tutor Session Memory\n{memory_text}\n"
    )
    if consultant_context:
        user_prompt += f"\n## Consultant Chat (relevant excerpts)\n{consultant_context}"

    content = await _llm(system, user_prompt)
    await summary_manager.save_subject_summary(
        db, user_id, subject, "daily", content, summary_date=target_date
    )
    logger.info("Daily summary generated for user=%s subject=%s date=%s", user_id, subject, target_date)
    return content


# ---------------------------------------------------------------------------
# regenerate_weekly_summary
# ---------------------------------------------------------------------------

async def regenerate_weekly_summary(
    db: AsyncSession,
    user_id: str,
    subject: str,
) -> str:
    """Regenerate weekly summary from last 7 daily summaries."""
    daily_rows = await summary_manager.get_last_n_daily_summaries(db, user_id, subject, n=7)

    if not daily_rows:
        content = "[No daily summaries yet — weekly summary will be available after first study day]"
    else:
        daily_text = "\n\n".join(
            f"Date: {r.summary_date}\n{r.content}" for r in reversed(daily_rows)
        )
        system = (
            "You are the HamroGuru Personalization Agent. Synthesize the student's last 7 days of "
            f"{_subject_display(subject)} study into a weekly summary. "
            "Cover: overall progress this week, topics studied, performance trends, "
            "persistent weak areas, what improved, and recommended focus for next week. "
            "Be concise — 6-8 sentences."
        )
        content = await _llm(system, f"## Last 7 Daily Summaries\n{daily_text}")

    await summary_manager.save_subject_summary(db, user_id, subject, "weekly", content)
    logger.info("Weekly summary regenerated for user=%s subject=%s", user_id, subject)
    return content


# ---------------------------------------------------------------------------
# update_alltime_summary
# ---------------------------------------------------------------------------

async def update_alltime_summary(
    db: AsyncSession,
    user_id: str,
    subject: str,
) -> str:
    """Update all-time summary by merging new daily summaries with previous all-time."""
    prev_alltime = await summary_manager.get_or_placeholder(db, user_id, subject, "all_time")
    recent_daily = await summary_manager.get_last_n_daily_summaries(db, user_id, subject, n=14)

    if not recent_daily:
        return prev_alltime

    daily_text = "\n\n".join(
        f"Date: {r.summary_date}\n{r.content}" for r in reversed(recent_daily)
    )
    system = (
        "You are the HamroGuru Personalization Agent. Update the student's all-time "
        f"{_subject_display(subject)} summary by incorporating recent activity. "
        "The all-time summary tracks: past academic performance, average score, strong/weak topics, "
        "progression over time, persistent difficulties, and which teaching methods work best. "
        "Merge new information with the previous summary — preserve important historical insights "
        "while updating with recent trends. Output 8-10 sentences."
    )
    user_prompt = (
        f"## Previous All-Time Summary\n{prev_alltime}\n\n"
        f"## Recent Daily Summaries (last 14 days)\n{daily_text}"
    )
    content = await _llm(system, user_prompt)
    await summary_manager.save_subject_summary(db, user_id, subject, "all_time", content)
    logger.info("All-time summary updated for user=%s subject=%s", user_id, subject)
    return content


# ---------------------------------------------------------------------------
# update_overall_summary
# ---------------------------------------------------------------------------

async def update_overall_summary(db: AsyncSession, user_id: str) -> str:
    """
    Regenerate the overall student summary.
    Fetches profile from main_backend; reads all subject all-time summaries.
    Embeds profile facts naturally in generated prose so downstream agents
    don't need the raw profile separately.
    """
    profile = await _fetch_profile(user_id)
    user_data = profile.get("user", {})
    sp = profile.get("student_profile") or {}

    name = user_data.get("full_name") or "Unknown"
    stream = sp.get("stream") or "not specified"
    school = sp.get("school_name") or "not specified"
    goal_college = sp.get("goal_college") or "not specified"
    see_gpa = sp.get("see_gpa")
    class_10 = sp.get("class_10_scores")
    class_9 = sp.get("class_9_scores")
    class_8 = sp.get("class_8_scores")

    profile_section = (
        f"Name: {name}\n"
        f"Stream: {stream}\n"
        f"School: {school}\n"
        f"Goal college: {goal_college}\n"
        f"SEE GPA: {see_gpa if see_gpa is not None else 'not provided'}\n"
    )
    if class_10:
        profile_section += f"Class 10 scores: {class_10}\n"
    if class_9:
        profile_section += f"Class 9 scores: {class_9}\n"
    if class_8:
        profile_section += f"Class 8 scores: {class_8}\n"

    subject_summaries = ""
    for subj in _ALL_SUBJECTS:
        content = await summary_manager.get_or_placeholder(db, user_id, subj, "all_time")
        subject_summaries += f"\n### {_subject_display(subj)}\n{content}\n"

    system = (
        "You are the HamroGuru Personalization Agent. Write a comprehensive overall student summary "
        "that will be passed to all AI agents (tutor, consultant, capsule) as context. "
        "Naturally embed the student's profile facts (name, stream, school, SEE GPA, class scores, "
        "goal college) within the narrative alongside learning insights. "
        "Cover: goals and ambitions, stream choice rationale, personality and learning style, "
        "general academic background, cross-subject strengths and weaknesses. "
        "Write 8-12 sentences in flowing prose — not bullet points. "
        "This summary must be self-contained so agents never need the raw profile."
    )
    user_prompt = (
        f"## Student Profile\n{profile_section}\n"
        f"## Subject All-Time Summaries\n{subject_summaries}"
    )
    content = await _llm(system, user_prompt)
    today = datetime.now(UTC).date()
    await summary_manager.save_overall_summary(db, user_id, content, covers_through=today)
    logger.info("Overall summary updated for user=%s", user_id)
    return content


# ---------------------------------------------------------------------------
# assign_level
# ---------------------------------------------------------------------------

async def assign_level(db: AsyncSession, user_id: str, subject: str) -> int:
    """Assign learning level (1-3) for a student/subject based on profile + practice history."""
    profile = await _fetch_profile(user_id)
    sp = profile.get("student_profile") or {}
    see_gpa = sp.get("see_gpa")
    class_10 = sp.get("class_10_scores")

    practice_rows = await db.execute(
        select(summary_manager.PracticeSessionSummary).where(
            summary_manager.PracticeSessionSummary.user_id == user_id,
            summary_manager.PracticeSessionSummary.subject == subject,
        ).order_by(summary_manager.PracticeSessionSummary.created_at.desc()).limit(20)
    )
    practice_sessions = practice_rows.scalars().all()

    practice_text = ""
    if practice_sessions:
        total_q = sum(p.total_questions for p in practice_sessions)
        total_correct = sum(p.correct_count for p in practice_sessions)
        avg_score = (total_correct / total_q * 100) if total_q > 0 else 0
        practice_text = (
            f"Total sessions: {len(practice_sessions)}\n"
            f"Average score: {avg_score:.1f}%\n"
            f"Total questions: {total_q}"
        )
    else:
        practice_text = "[No practice data yet]"

    system = (
        "You are the HamroGuru Personalization Agent. Assign a learning level (1, 2, or 3) for a student. "
        "Level 1 = strong foundation (focus on hard topics). "
        "Level 2 = average (solid on basics, difficulty with hard concepts). "
        "Level 3 = weak foundation (difficulty even with basics). "
        "Base your decision on SEE GPA, class scores, and practice performance. "
        "If data is insufficient, output 2. "
        "Respond with ONLY a single digit: 1, 2, or 3."
    )
    user_prompt = (
        f"Subject: {_subject_display(subject)}\n"
        f"SEE GPA: {see_gpa if see_gpa is not None else 'not provided'}\n"
        f"Class 10 scores: {class_10 or 'not provided'}\n\n"
        f"## Practice Performance\n{practice_text}"
    )
    raw = await _llm(system, user_prompt)
    try:
        level = int(raw.strip()[0])
        if level not in (1, 2, 3):
            level = 2
    except Exception:
        level = 2

    await summary_manager.upsert_student_level(db, user_id, subject, level)
    logger.info("Level assigned: user=%s subject=%s level=%d", user_id, subject, level)
    return level


# ---------------------------------------------------------------------------
# review_consultant
# ---------------------------------------------------------------------------

async def review_consultant(db: AsyncSession, user_id: str) -> None:
    """
    Read today's consultant chat. Update overall summary and timeline if needed.
    Called at end of day by worker.
    """
    today = datetime.now(UTC).date()
    consultant_stmt = (
        select(ChatSession)
        .where(
            ChatSession.user_id == user_id,
            ChatSession.agent_type == AgentType.consultant,
            ChatSession.session_date == today,
        )
    )
    c_result = await db.execute(consultant_stmt)
    sessions = c_result.scalars().all()

    if not sessions:
        return

    all_messages: list[str] = []
    for cs in sessions:
        msg_rows = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == cs.id)
            .order_by(ChatMessage.created_at.asc())
        )
        for m in msg_rows.scalars().all():
            all_messages.append(f"{m.role}: {m.content[:400]}")

    if not all_messages:
        return

    chat_text = "\n".join(all_messages)
    overall = await summary_manager.get_or_placeholder_overall(db, user_id)
    timeline = await summary_manager.get_consultant_timeline(db, user_id)
    timeline_text = timeline.content if timeline else "[No timeline]"

    system = (
        "You are the HamroGuru Personalization Agent reviewing today's consultant chat. "
        "Decide if the student revealed new information about their goals, struggles, personality, "
        "or circumstances that should update their overall summary or preparation timeline. "
        "Respond in JSON with two keys: "
        '{"update_summary": "new overall summary text or null", '
        '"update_timeline": "new timeline text or null"}. '
        "Set a key to null if no update is needed. "
        "If updating summary, write the full updated summary (not a diff). "
        "If updating timeline, write the full updated timeline (not a diff)."
    )
    user_prompt = (
        f"## Today's Consultant Chat\n{chat_text}\n\n"
        f"## Current Overall Summary\n{overall}\n\n"
        f"## Current Preparation Timeline\n{timeline_text}"
    )

    import json as _json
    raw = await _llm(system, user_prompt)
    try:
        # Strip markdown code fences if present
        clean = raw.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        result = _json.loads(clean.strip())
    except Exception:
        logger.warning("review_consultant JSON parse failed for user=%s", user_id)
        return

    if result.get("update_summary"):
        today_date = datetime.now(UTC).date()
        await summary_manager.save_overall_summary(
            db, user_id, result["update_summary"], covers_through=today_date
        )
        logger.info("Overall summary updated from consultant review for user=%s", user_id)

    if result.get("update_timeline"):
        await summary_manager.save_consultant_timeline(db, user_id, result["update_timeline"])
        logger.info("Timeline updated from consultant review for user=%s", user_id)
