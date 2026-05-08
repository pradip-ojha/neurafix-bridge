"""
Practice session API.

POST /api/practice/start       → create session, return questions
POST /api/practice/submit      → score answers, return results
POST /api/practice/close       → close session, async generate summary
GET  /api/practice/history     → list PracticeSessionSummary rows
GET  /api/practice/chapters    → list chapters with questions for a subject
POST /api/practice/followup    → SSE follow-up chat about a session
"""
from __future__ import annotations

import asyncio
import logging
import math
from datetime import datetime, UTC

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.auth import get_current_user_id
from app.database import get_db
from app.models.mcq_question import MainQuestion
from app.models.personalization import PracticeSessionSummary
from app.models.practice_session import PracticeSession, PracticeSessionStatus
from app.agents.practice.agent import PracticeFollowupAgent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/practice", tags=["practice"])

_STREAM_SUBJECTS: dict[str, list[str]] = {
    "science": ["compulsory_math", "optional_math", "compulsory_english", "compulsory_science"],
    "management": ["compulsory_math", "compulsory_english"],
    "both": ["compulsory_math", "optional_math", "compulsory_english", "compulsory_science"],
}


async def _get_student_stream(user_id: str) -> str:
    url = f"{settings.MAIN_BACKEND_URL}/api/internal/profile/{user_id}"
    headers = {"X-Internal-Secret": settings.MAIN_BACKEND_INTERNAL_SECRET}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                sp = data.get("student_profile") or {}
                return sp.get("stream") or "both"
    except Exception:
        pass
    return "both"


def _compute_difficulty_split(count: int) -> dict[str, int]:
    easy = math.floor(count * 0.4)
    medium = math.floor(count * 0.4)
    hard = count - easy - medium
    return {"easy": easy, "medium": medium, "hard": hard}


def _strip_answers(data: dict) -> dict:
    return {k: v for k, v in data.items() if k != "correct_option_ids"}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

_WHOLE_SUBJECT = "__all__"  # sentinel stored in DB when no specific chapter is chosen


class StartRequest(BaseModel):
    subject: str
    chapter: str | None = None  # None = whole-subject practice
    count: int = Field(default=10, ge=1, le=50)
    timer_enabled: bool = False
    optional_message: str | None = None


class SubmitRequest(BaseModel):
    session_id: str
    answers: dict[str, str]  # {question_id: selected_option_id}


class CloseRequest(BaseModel):
    session_id: str


class FollowupMessage(BaseModel):
    role: str
    content: str


class FollowupRequest(BaseModel):
    session_id: str
    message: str
    session_history: list[FollowupMessage] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/start")
async def start_practice(
    req: StartRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    student_stream = await _get_student_stream(user_id)
    valid_subjects = _STREAM_SUBJECTS.get(student_stream, _STREAM_SUBJECTS["both"])
    if req.subject not in valid_subjects:
        raise HTTPException(
            status_code=400,
            detail=f"Subject '{req.subject}' is not available for your stream.",
        )

    selected_rows: list[MainQuestion] = []
    chapter_key = req.chapter or _WHOLE_SUBJECT  # stored in DB

    if req.chapter:
        # Chapter-wise: 40/40/20 difficulty split from a single chapter
        split = _compute_difficulty_split(req.count)
        for diff, target in split.items():
            if target == 0:
                continue
            rows = (await db.execute(
                select(MainQuestion)
                .where(
                    MainQuestion.subject == req.subject,
                    MainQuestion.chapter == req.chapter,
                    MainQuestion.difficulty == diff,
                    MainQuestion.is_active == True,
                )
                .order_by(text("RANDOM()"))
                .limit(target)
            )).scalars().all()
            selected_rows.extend(rows)

        # Fill remainder if pool is thin for this chapter
        if len(selected_rows) < req.count:
            existing_ids = {r.question_id for r in selected_rows}
            extra = (await db.execute(
                select(MainQuestion)
                .where(
                    MainQuestion.subject == req.subject,
                    MainQuestion.chapter == req.chapter,
                    MainQuestion.is_active == True,
                    MainQuestion.question_id.notin_(existing_ids),
                )
                .order_by(text("RANDOM()"))
                .limit(req.count - len(selected_rows))
            )).scalars().all()
            selected_rows.extend(extra)
    else:
        # Whole-subject: distribute evenly across all chapters
        chapter_rows = (await db.execute(
            select(MainQuestion.chapter)
            .where(MainQuestion.subject == req.subject, MainQuestion.is_active == True)
            .distinct()
        )).scalars().all()

        chapters = list(chapter_rows)
        if not chapters:
            raise HTTPException(
                status_code=404,
                detail=f"No active questions found for subject='{req.subject}'.",
            )

        per_chapter = req.count // len(chapters)
        remainder = req.count % len(chapters)

        for i, ch in enumerate(chapters):
            ch_count = per_chapter + (1 if i < remainder else 0)
            if ch_count == 0:
                continue
            rows = (await db.execute(
                select(MainQuestion)
                .where(
                    MainQuestion.subject == req.subject,
                    MainQuestion.chapter == ch,
                    MainQuestion.is_active == True,
                )
                .order_by(text("RANDOM()"))
                .limit(ch_count)
            )).scalars().all()
            selected_rows.extend(rows)

    if not selected_rows:
        detail = (
            f"No active questions found for subject='{req.subject}', chapter='{req.chapter}'."
            if req.chapter
            else f"No active questions found for subject='{req.subject}'."
        )
        raise HTTPException(status_code=404, detail=detail)

    question_ids = [r.question_id for r in selected_rows]
    questions = [_strip_answers(r.data) for r in selected_rows]

    session = PracticeSession(
        user_id=user_id,
        subject=req.subject,
        chapter=chapter_key,
        session_date=datetime.now(UTC).date(),
        status=PracticeSessionStatus.active,
        question_ids=question_ids,
        config={
            "count": req.count,
            "timer_enabled": req.timer_enabled,
            "optional_message": req.optional_message,
        },
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {
        "session_id": session.id,
        "subject": req.subject,
        "chapter": chapter_key,
        "is_whole_subject": chapter_key == _WHOLE_SUBJECT,
        "questions": questions,
        "total": len(questions),
        "config": session.config,
    }


@router.post("/submit")
async def submit_practice(
    req: SubmitRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(PracticeSession, req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Practice session not found.")
    if session.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied.")
    if session.status != PracticeSessionStatus.active:
        raise HTTPException(status_code=400, detail="Session is not active.")

    # Fetch all questions in order
    question_rows = (await db.execute(
        select(MainQuestion).where(MainQuestion.question_id.in_(session.question_ids))
    )).scalars().all()

    question_map = {r.question_id: r for r in question_rows}

    correct_count = 0
    results: dict[str, dict] = {}

    # Topic tracking for summary
    topic_correct: dict[str, int] = {}
    topic_wrong: dict[str, int] = {}

    for qid in session.question_ids:
        row = question_map.get(qid)
        if not row:
            continue

        data = row.data
        student_answer = req.answers.get(qid)
        correct_ids: list[str] = data.get("correct_option_ids", [])
        is_correct = bool(student_answer and student_answer in correct_ids)

        if is_correct:
            correct_count += 1

        topic = row.topic or "unknown"
        if is_correct:
            topic_correct[topic] = topic_correct.get(topic, 0) + 1
        else:
            topic_wrong[topic] = topic_wrong.get(topic, 0) + 1

        results[qid] = {
            "correct": is_correct,
            "student_answer": student_answer,
            "correct_option_ids": correct_ids,
            "explanation": data.get("explanation", ""),
            "common_mistakes": data.get("common_mistakes", {}),
            "topic": topic,
            "difficulty": row.difficulty,
            "question_data": _strip_answers(data),
        }

    score_data = {
        "score": correct_count,
        "total": len(session.question_ids),
        "results": results,
        "topic_correct": topic_correct,
        "topic_wrong": topic_wrong,
    }

    session.status = PracticeSessionStatus.submitted
    session.score_data = score_data
    await db.commit()

    return score_data


@router.post("/close")
async def close_practice(
    req: CloseRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(PracticeSession, req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Practice session not found.")
    if session.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied.")
    if session.status == PracticeSessionStatus.closed:
        return {"closed": True, "session_id": req.session_id}
    if session.status == PracticeSessionStatus.active:
        raise HTTPException(status_code=400, detail="Submit the session before closing.")

    session.status = PracticeSessionStatus.closed
    await db.commit()

    # Fire-and-forget: generate PracticeSessionSummary
    if session.score_data:
        asyncio.create_task(
            _generate_practice_summary(
                session_id=session.id,
                user_id=user_id,
                subject=session.subject,
                chapter=session.chapter,
                session_date=session.session_date,
                score_data=session.score_data,
            )
        )

    return {"closed": True, "session_id": req.session_id}


@router.get("/history")
async def get_history(
    subject: str | None = Query(default=None),
    chapter: str | None = Query(default=None),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(PracticeSessionSummary)
        .where(PracticeSessionSummary.user_id == user_id)
        .order_by(PracticeSessionSummary.created_at.desc())
    )
    if subject:
        stmt = stmt.where(PracticeSessionSummary.subject == subject)
    if chapter:
        stmt = stmt.where(PracticeSessionSummary.chapter == chapter)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    return [
        {
            "id": r.id,
            "subject": r.subject,
            "chapter": r.chapter,
            "session_date": r.session_date.isoformat(),
            "total_questions": r.total_questions,
            "correct_count": r.correct_count,
            "incorrect_count": r.incorrect_count,
            "topic_breakdown": r.topic_breakdown,
            "summary_content": r.summary_content,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/chapters")
async def get_chapters(
    subject: str = Query(...),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(MainQuestion.chapter)
        .where(MainQuestion.subject == subject, MainQuestion.is_active == True)
        .distinct()
        .order_by(MainQuestion.chapter)
    )).scalars().all()

    return {"subject": subject, "chapters": list(rows)}


@router.post("/followup")
async def followup_practice(
    req: FollowupRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(PracticeSession, req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Practice session not found.")
    if session.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied.")
    if session.status == PracticeSessionStatus.active:
        raise HTTPException(status_code=400, detail="Submit the session before follow-up.")
    if not session.score_data:
        raise HTTPException(status_code=400, detail="No score data available for this session.")

    agent = PracticeFollowupAgent(
        subject=session.subject,
        chapter=session.chapter,
        score_data=session.score_data,
    )

    # Build message history
    messages = [{"role": m.role, "content": m.content} for m in req.session_history]
    messages.append({"role": "user", "content": req.message})

    async def generate():
        async for chunk in agent.stream_response(messages):
            yield chunk

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Async summary generation
# ---------------------------------------------------------------------------

async def _generate_practice_summary(
    session_id: str,
    user_id: str,
    subject: str,
    chapter: str,
    session_date,
    score_data: dict,
) -> None:
    from openai import AsyncOpenAI
    from app.database import AsyncSessionLocal

    try:
        score = score_data.get("score", 0)
        total = score_data.get("total", 0)
        topic_wrong: dict = score_data.get("topic_wrong", {})
        topic_correct: dict = score_data.get("topic_correct", {})

        worst_topics = sorted(topic_wrong.items(), key=lambda x: x[1], reverse=True)[:3]
        best_topics = sorted(topic_correct.items(), key=lambda x: x[1], reverse=True)[:3]

        worst_str = ", ".join(f"{t} ({c} wrong)" for t, c in worst_topics) or "none"
        best_str = ", ".join(f"{t} ({c} correct)" for t, c in best_topics) or "none"

        chapter_display = "Whole Subject" if chapter == _WHOLE_SUBJECT else chapter
        prompt = (
            f"Write a 2-3 sentence practice session summary.\n"
            f"Subject: {subject}, Chapter: {chapter_display}\n"
            f"Score: {score}/{total}\n"
            f"Most mistakes on topics: {worst_str}\n"
            f"Performed well on: {best_str}\n"
            f"Format: 'Student attempted N questions on [chapter]. Score X/N. "
            f"Most mistakes on [topics]. Performed well on [topics].'"
        )

        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You generate concise practice session summaries."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=120,
        )
        narrative = (resp.choices[0].message.content or "").strip()

        # Compute topic_breakdown for summary model
        all_topics = set(topic_correct) | set(topic_wrong)
        topic_breakdown = {
            t: {"correct": topic_correct.get(t, 0), "wrong": topic_wrong.get(t, 0)}
            for t in all_topics
        }

        async with AsyncSessionLocal() as db:
            summary = PracticeSessionSummary(
                user_id=user_id,
                subject=subject,
                chapter=chapter,
                session_date=session_date,
                total_questions=total,
                correct_count=score,
                incorrect_count=total - score,
                topic_breakdown=topic_breakdown,
                summary_content=narrative,
            )
            db.add(summary)
            await db.commit()
            logger.info("PracticeSessionSummary saved for session=%s user=%s", session_id, user_id)

    except Exception as exc:
        logger.error("Failed to generate practice summary for session=%s: %s", session_id, exc)
