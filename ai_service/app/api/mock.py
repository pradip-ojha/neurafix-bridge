"""
Mock test API.

POST /api/mock/start       → create session, return questions grouped by subject
POST /api/mock/submit      → score answers, return per-subject results
GET  /api/mock/history     → list user's submitted mock sessions
GET  /api/mock/leaderboard → top 10 scores for a college on a date (or all-time)
"""
from __future__ import annotations

import asyncio
from datetime import datetime, date, UTC

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.auth import get_current_user_id
from app.database import get_db
from app.models.mcq_question import ExtraQuestion, MainQuestion
from app.models.mock_session import MockSession, MockSessionStatus

router = APIRouter(prefix="/api/mock", tags=["mock"])

_MAIN_SUBJECTS = {"compulsory_math", "optional_math", "compulsory_english", "compulsory_science"}


def _strip_answers(data: dict) -> dict:
    return {k: v for k, v in data.items() if k != "correct_option_ids"}


async def _get_college(college_id: str) -> dict:
    url = f"{settings.MAIN_BACKEND_URL}/api/internal/colleges/{college_id}"
    headers = {"X-Internal-Secret": settings.MAIN_BACKEND_INTERNAL_SECRET}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    raise HTTPException(status_code=404, detail="College not found.")


async def _resolve_names(user_ids: list[str]) -> dict[str, str]:
    async def fetch_one(uid: str) -> tuple[str, str]:
        url = f"{settings.MAIN_BACKEND_URL}/api/internal/profile/{uid}"
        headers = {"X-Internal-Secret": settings.MAIN_BACKEND_INTERNAL_SECRET}
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    name = (data.get("user") or {}).get("full_name", "Unknown")
                    return uid, name
        except Exception:
            pass
        return uid, "Unknown"

    results = await asyncio.gather(*[fetch_one(uid) for uid in user_ids])
    return dict(results)


def _compute_class_splits(count: int, dist: dict[str, int]) -> list[tuple[int, int]]:
    """Proportionally split `count` across class levels in `dist`. Returns [(class_level, n), ...]."""
    grand = sum(dist.values())
    if grand == 0:
        return []
    result: list[tuple[int, int]] = []
    allocated = 0
    levels = list(dist.keys())
    for i, lk in enumerate(levels):
        lvl = int(lk)
        if i == len(levels) - 1:
            n = count - allocated
        else:
            n = round(count * dist[lk] / grand)
        if n > 0:
            result.append((lvl, n))
        allocated += n
    return result


async def _fetch_questions_for_class(
    db: AsyncSession,
    subject: str,
    count: int,
    class_lvl: int | None,
    exclude_ids: set[str],
) -> list[MainQuestion]:
    """Select `count` questions for one class level, distributing evenly across chapters."""
    if class_lvl is not None:
        cls_filter = [or_(MainQuestion.class_level == class_lvl, MainQuestion.class_level.is_(None))]
    else:
        cls_filter = []

    chapter_rows = (await db.execute(
        select(MainQuestion.chapter)
        .where(MainQuestion.subject == subject, MainQuestion.is_active == True, *cls_filter)
        .distinct()
    )).scalars().all()

    chapters = list(chapter_rows)
    if not chapters:
        return []

    per_chapter = count // len(chapters)
    remainder = count % len(chapters)
    selected: list[MainQuestion] = []

    for i, ch in enumerate(chapters):
        ch_count = per_chapter + (1 if i < remainder else 0)
        if ch_count == 0:
            continue
        filters = [
            MainQuestion.subject == subject,
            MainQuestion.chapter == ch,
            MainQuestion.is_active == True,
            *cls_filter,
        ]
        if exclude_ids:
            filters.append(MainQuestion.question_id.notin_(exclude_ids))
        rows = (await db.execute(
            select(MainQuestion).where(*filters).order_by(text("RANDOM()")).limit(ch_count)
        )).scalars().all()
        selected.extend(rows)

    return selected


async def _select_main_questions(
    db: AsyncSession,
    subject: str,
    count: int,
    class_level_distribution: dict[str, int] | None = None,
) -> list[MainQuestion]:
    selected: list[MainQuestion] = []
    used_ids: set[str] = set()

    if class_level_distribution:
        splits = _compute_class_splits(count, class_level_distribution)
        for class_lvl, cls_count in splits:
            rows = await _fetch_questions_for_class(db, subject, cls_count, class_lvl, used_ids)
            for r in rows:
                used_ids.add(r.question_id)
            selected.extend(rows)
    else:
        rows = await _fetch_questions_for_class(db, subject, count, None, used_ids)
        selected.extend(rows)

    return selected


async def _select_extra_questions(
    db: AsyncSession, subject: str, count: int
) -> list[ExtraQuestion]:
    rows = (await db.execute(
        select(ExtraQuestion)
        .where(ExtraQuestion.subject == subject, ExtraQuestion.is_active == True)
        .order_by(text("RANDOM()"))
        .limit(count)
    )).scalars().all()
    return list(rows)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class StartRequest(BaseModel):
    college_id: str | None = None
    custom_distribution: dict[str, int] | None = None
    time_limit_minutes: int | None = None


class SubmitRequest(BaseModel):
    session_id: str
    answers: dict[str, str]  # {question_id: selected_option_id}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/start")
async def start_mock(
    req: StartRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if not req.college_id and not req.custom_distribution:
        raise HTTPException(
            status_code=400,
            detail="Provide either college_id or custom_distribution.",
        )

    class_level_distribution: dict[str, int] | None = None

    if req.college_id:
        college = await _get_college(req.college_id)
        distribution: dict[str, int] = college.get("question_distribution") or {}
        time_limit = college.get("total_time_minutes", 60)
        class_level_distribution = college.get("class_level_distribution") or None
        if not distribution:
            raise HTTPException(
                status_code=400,
                detail="This college has no question distribution configured.",
            )
    else:
        distribution = req.custom_distribution or {}
        time_limit = req.time_limit_minutes or 30

    questions_by_subject: dict[str, list[dict]] = {}
    question_ids_by_subject: dict[str, list[str]] = {}
    total = 0

    for subject, count in distribution.items():
        if count <= 0:
            continue

        if subject in _MAIN_SUBJECTS:
            rows = await _select_main_questions(db, subject, count, class_level_distribution)
            if not rows:
                raise HTTPException(
                    status_code=404,
                    detail=f"No active questions found for subject '{subject}'.",
                )
            question_ids_by_subject[subject] = [r.question_id for r in rows]
            questions_by_subject[subject] = [_strip_answers(r.data) for r in rows]
        else:
            rows_extra = await _select_extra_questions(db, subject, count)
            if not rows_extra:
                raise HTTPException(
                    status_code=404,
                    detail=f"No active questions found for extra subject '{subject}'.",
                )
            question_ids_by_subject[subject] = [r.question_id for r in rows_extra]
            questions_by_subject[subject] = [_strip_answers(r.data) for r in rows_extra]

        total += len(question_ids_by_subject[subject])

    if total == 0:
        raise HTTPException(status_code=404, detail="No questions could be selected.")

    session = MockSession(
        user_id=user_id,
        college_id=req.college_id,
        session_date=datetime.now(UTC).date(),
        status=MockSessionStatus.active,
        question_ids=question_ids_by_subject,
        time_limit_minutes=time_limit,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {
        "session_id": session.id,
        "college_id": req.college_id,
        "time_limit_minutes": time_limit,
        "subjects": list(questions_by_subject.keys()),
        "distribution": {s: len(qs) for s, qs in questions_by_subject.items()},
        "questions": questions_by_subject,
        "total": total,
    }


@router.post("/submit")
async def submit_mock(
    req: SubmitRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(MockSession, req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Mock session not found.")
    if session.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied.")
    if session.status != MockSessionStatus.active:
        raise HTTPException(status_code=400, detail="Session is not active.")

    question_ids_by_subject: dict[str, list[str]] = session.question_ids
    overall_correct = 0
    overall_total = 0
    per_subject: dict[str, dict] = {}

    for subject, qids in question_ids_by_subject.items():
        if subject in _MAIN_SUBJECTS:
            rows = (await db.execute(
                select(MainQuestion).where(MainQuestion.question_id.in_(qids))
            )).scalars().all()
            question_map = {r.question_id: r for r in rows}

            subject_correct = 0
            subject_questions = []

            for qid in qids:
                row = question_map.get(qid)
                if not row:
                    continue
                data = row.data
                student_answer = req.answers.get(qid)
                correct_ids: list[str] = data.get("correct_option_ids", [])
                is_correct = bool(student_answer and student_answer in correct_ids)
                if is_correct:
                    subject_correct += 1

                subject_questions.append({
                    "question_id": qid,
                    "correct": is_correct,
                    "student_answer": student_answer,
                    "correct_option_ids": correct_ids,
                    "explanation": data.get("explanation", ""),
                    "common_mistakes": data.get("common_mistakes", {}),
                    "topic": row.topic,
                    "chapter": row.chapter,
                    "difficulty": row.difficulty,
                    "question_data": _strip_answers(data),
                })

            per_subject[subject] = {
                "total": len(subject_questions),
                "correct": subject_correct,
                "questions": subject_questions,
            }
            overall_correct += subject_correct
            overall_total += len(subject_questions)

        else:
            rows_extra = (await db.execute(
                select(ExtraQuestion).where(ExtraQuestion.question_id.in_(qids))
            )).scalars().all()
            question_map_extra = {r.question_id: r for r in rows_extra}

            subject_correct = 0
            subject_questions = []

            for qid in qids:
                row = question_map_extra.get(qid)
                if not row:
                    continue
                data = row.data
                student_answer = req.answers.get(qid)
                correct_ids = data.get("correct_option_ids", [])
                is_correct = bool(student_answer and student_answer in correct_ids)
                if is_correct:
                    subject_correct += 1

                subject_questions.append({
                    "question_id": qid,
                    "correct": is_correct,
                    "student_answer": student_answer,
                    "correct_option_ids": correct_ids,
                    "explanation": data.get("explanation", ""),
                    "common_mistakes": data.get("common_mistakes", {}),
                    "topic": data.get("topic", "unknown"),
                    "chapter": data.get("chapter"),
                    "difficulty": row.difficulty,
                    "question_data": _strip_answers(data),
                })

            per_subject[subject] = {
                "total": len(subject_questions),
                "correct": subject_correct,
                "questions": subject_questions,
            }
            overall_correct += subject_correct
            overall_total += len(subject_questions)

    score_data = {
        "total": overall_total,
        "correct": overall_correct,
        "per_subject": per_subject,
    }

    session.status = MockSessionStatus.submitted
    session.score_data = score_data
    await db.commit()

    return score_data


@router.get("/history")
async def get_history(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(MockSession)
        .where(
            MockSession.user_id == user_id,
            MockSession.status == MockSessionStatus.submitted,
        )
        .order_by(MockSession.created_at.desc())
    )
    rows = result.scalars().all()

    return [
        {
            "id": r.id,
            "college_id": r.college_id,
            "session_date": r.session_date.isoformat(),
            "time_limit_minutes": r.time_limit_minutes,
            "total": (r.score_data or {}).get("total", 0),
            "correct": (r.score_data or {}).get("correct", 0),
            "subjects": list((r.question_ids or {}).keys()),
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/leaderboard")
async def get_leaderboard(
    college_id: str = Query(...),
    date: str | None = Query(default=None),
    all_time: bool = Query(default=False),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    if all_time:
        result = await db.execute(
            text("""
                SELECT DISTINCT ON (user_id)
                    user_id,
                    (score_data->>'correct')::int AS correct,
                    (score_data->>'total')::int   AS total
                FROM mock_sessions
                WHERE college_id = :college_id
                  AND status = 'submitted'
                  AND score_data IS NOT NULL
                ORDER BY user_id, (score_data->>'correct')::int DESC
            """),
            {"college_id": college_id},
        )
    else:
        date_obj: date = (
            datetime.fromisoformat(date).date() if date else datetime.now(UTC).date()
        )
        result = await db.execute(
            text("""
                SELECT DISTINCT ON (user_id)
                    user_id,
                    (score_data->>'correct')::int AS correct,
                    (score_data->>'total')::int   AS total
                FROM mock_sessions
                WHERE college_id   = :college_id
                  AND session_date = :date
                  AND status       = 'submitted'
                  AND score_data IS NOT NULL
                ORDER BY user_id, (score_data->>'correct')::int DESC
            """),
            {"college_id": college_id, "date": date_obj},
        )

    all_rows = sorted(result.fetchall(), key=lambda r: r.correct, reverse=True)

    my_rank: int | None = None
    for i, row in enumerate(all_rows):
        if row.user_id == user_id:
            my_rank = i + 1
            break

    top10_rows = all_rows[:10]
    top10_user_ids = [r.user_id for r in top10_rows]
    name_map = await _resolve_names(top10_user_ids)

    top10 = [
        {
            "rank": i + 1,
            "user_id": row.user_id,
            "name": name_map.get(row.user_id, "Unknown"),
            "correct": row.correct,
            "total": row.total,
        }
        for i, row in enumerate(top10_rows)
    ]

    return {"top10": top10, "my_rank": my_rank, "total_participants": len(all_rows)}
