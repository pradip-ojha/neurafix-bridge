"""
MCQ Question Pool API.
Admin endpoints require X-Internal-Secret header.
check-answers requires JWT Bearer token.
"""

from __future__ import annotations

import json
import logging
import math
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from pydantic import ValidationError
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.auth import get_current_user_id
from app.database import get_db
from app.models.mcq_question import DifficultyEnum, ExtraQuestion, ExtraSubject, MainQuestion
from app.schemas.questions import (
    AnswerCheckRequest,
    AnswerCheckResult,
    ChapterDifficultyCounts,
    ChapterStats,
    ExtraSubjectIn,
    ExtraSubjectOut,
    PoolStatsResult,
    QuestionIn,
    SingleAnswerResult,
    UploadResult,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/questions", tags=["questions"])


def require_internal_secret(x_internal_secret: str = Header(...)) -> None:
    if x_internal_secret != settings.MAIN_BACKEND_INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")


# ---------------------------------------------------------------------------
# Upload endpoints
# ---------------------------------------------------------------------------

def _parse_json_file(raw: bytes, filename: str) -> list[dict]:
    """Parse uploaded .json file bytes into a list of question dicts."""
    if not filename.lower().endswith(".json"):
        raise HTTPException(status_code=400, detail="Only .json files are accepted")
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON file: {exc}")
    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail="JSON file must contain an array of question objects")
    if len(parsed) == 0:
        raise HTTPException(status_code=400, detail="JSON file is empty")
    return parsed


@router.post("/upload/main", response_model=UploadResult)
async def upload_main_questions(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_secret),
):
    """
    Upload a .json file containing an array of main subject question objects.
    Each question is validated and stored as its own DB row.
    Re-uploading a question_id that already exists updates that row.
    Rejects the entire batch if any item fails schema validation.
    """
    raw = await file.read()
    questions = _parse_json_file(raw, file.filename or "")

    validated: list[QuestionIn] = []
    errors: list[str] = []

    for i, raw_q in enumerate(questions):
        try:
            validated.append(QuestionIn.model_validate(raw_q))
        except ValidationError as exc:
            qid = raw_q.get("question_id", f"index {i}") if isinstance(raw_q, dict) else f"index {i}"
            for e in exc.errors():
                errors.append(f"[{qid}] {'.'.join(str(x) for x in e['loc'])}: {e['msg']}")

    if errors:
        return UploadResult(accepted=0, rejected=len(questions), errors=errors)

    for q in validated:
        existing = await db.execute(
            select(MainQuestion).where(MainQuestion.question_id == q.question_id)
        )
        row = existing.scalar_one_or_none()
        data = q.model_dump()
        if row:
            row.data = data
            row.version = row.version + 1
            row.difficulty = q.difficulty
            row.subject = q.subject
            row.chapter = q.chapter
            row.topic = q.topic
            row.subtopic = q.subtopic
            row.is_active = q.is_active
        else:
            db.add(MainQuestion(
                question_id=q.question_id,
                subject=q.subject,
                chapter=q.chapter,
                topic=q.topic,
                subtopic=q.subtopic,
                difficulty=q.difficulty,
                is_active=q.is_active,
                version=q.version,
                data=data,
            ))

    await db.commit()
    logger.info("Uploaded %d main questions from file %s", len(validated), file.filename)
    return UploadResult(accepted=len(validated), rejected=0, errors=[])


@router.post("/upload/extra", response_model=UploadResult)
async def upload_extra_questions(
    subject: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_secret),
):
    """
    Upload a .json file containing an array of extra subject question objects.
    subject is provided as a form field (since extra questions have no subject inside each object).
    Re-uploading a question_id that already exists updates that row.
    Rejects the entire batch if any item fails schema validation.
    """
    from app.schemas.questions import ExtraQuestionIn

    raw = await file.read()
    questions = _parse_json_file(raw, file.filename or "")

    validated: list[ExtraQuestionIn] = []
    errors: list[str] = []

    for i, raw_q in enumerate(questions):
        try:
            validated.append(ExtraQuestionIn.model_validate(raw_q))
        except ValidationError as exc:
            qid = raw_q.get("question_id", f"index {i}") if isinstance(raw_q, dict) else f"index {i}"
            for e in exc.errors():
                errors.append(f"[{qid}] {'.'.join(str(x) for x in e['loc'])}: {e['msg']}")

    if errors:
        return UploadResult(accepted=0, rejected=len(questions), errors=errors)

    for q in validated:
        existing = await db.execute(
            select(ExtraQuestion).where(ExtraQuestion.question_id == q.question_id)
        )
        row = existing.scalar_one_or_none()
        data = q.model_dump()
        if row:
            row.data = data
            row.version = row.version + 1
            row.difficulty = q.difficulty
            row.subject = subject
            row.is_active = q.is_active
        else:
            db.add(ExtraQuestion(
                question_id=q.question_id,
                subject=subject,
                difficulty=q.difficulty,
                is_active=q.is_active,
                version=q.version,
                data=data,
            ))

    await db.commit()
    logger.info("Uploaded %d extra questions for subject %s from file %s", len(validated), subject, file.filename)
    return UploadResult(accepted=len(validated), rejected=0, errors=[])


# ---------------------------------------------------------------------------
# Extra subjects
# ---------------------------------------------------------------------------

@router.post("/extra-subjects", response_model=ExtraSubjectOut, status_code=201)
async def create_extra_subject(
    body: ExtraSubjectIn,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_secret),
):
    existing = await db.execute(
        select(ExtraSubject).where(ExtraSubject.subject_key == body.subject_key)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"subject_key '{body.subject_key}' already exists")
    subj = ExtraSubject(subject_key=body.subject_key, display_name=body.display_name)
    db.add(subj)
    await db.commit()
    await db.refresh(subj)
    return subj


@router.get("/extra-subjects", response_model=list[ExtraSubjectOut])
async def list_extra_subjects(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_secret),
):
    result = await db.execute(select(ExtraSubject).order_by(ExtraSubject.display_name))
    return result.scalars().all()


@router.patch("/extra-subjects/{subject_key}/toggle")
async def toggle_extra_subject(
    subject_key: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_secret),
):
    result = await db.execute(
        select(ExtraSubject).where(ExtraSubject.subject_key == subject_key)
    )
    subj = result.scalar_one_or_none()
    if not subj:
        raise HTTPException(status_code=404, detail="Extra subject not found")
    subj.is_active = not subj.is_active
    await db.commit()
    return {"subject_key": subject_key, "is_active": subj.is_active}


# ---------------------------------------------------------------------------
# Question pool
# ---------------------------------------------------------------------------

def _strip_answers(data: dict) -> dict:
    """Return question data without correct_option_ids."""
    return {k: v for k, v in data.items() if k != "correct_option_ids"}


def _compute_difficulty_split(count: int) -> dict[str, int]:
    """40% easy, 40% medium, 20% hard — sum always equals count."""
    easy = math.floor(count * 0.4)
    medium = math.floor(count * 0.4)
    hard = count - easy - medium
    return {"easy": easy, "medium": medium, "hard": hard}


@router.get("/pool")
async def get_question_pool(
    subject: str = Query(...),
    chapter: str | None = Query(default=None),
    difficulty: str | None = Query(default=None),
    count: int = Query(default=10, ge=1, le=200),
    mode: str = Query(default="practice"),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_secret),
):
    """
    Serve questions without correct_option_ids.
    mode=practice: chapter required, 40/40/20 difficulty split.
    mode=mock: distributes across all chapters for the subject.
    """
    if mode not in ("practice", "mock"):
        raise HTTPException(status_code=400, detail="mode must be 'practice' or 'mock'")

    questions: list[dict[str, Any]] = []

    if mode == "practice":
        if not chapter:
            raise HTTPException(status_code=400, detail="chapter is required for mode=practice")

        if difficulty:
            # Single difficulty override
            rows = (await db.execute(
                select(MainQuestion)
                .where(
                    MainQuestion.subject == subject,
                    MainQuestion.chapter == chapter,
                    MainQuestion.difficulty == difficulty,
                    MainQuestion.is_active == True,
                )
                .order_by(text("RANDOM()"))
                .limit(count)
            )).scalars().all()
            questions = [_strip_answers(r.data) for r in rows]
        else:
            split = _compute_difficulty_split(count)
            collected: list[dict] = []

            for diff, target in split.items():
                if target == 0:
                    continue
                rows = (await db.execute(
                    select(MainQuestion)
                    .where(
                        MainQuestion.subject == subject,
                        MainQuestion.chapter == chapter,
                        MainQuestion.difficulty == diff,
                        MainQuestion.is_active == True,
                    )
                    .order_by(text("RANDOM()"))
                    .limit(target)
                )).scalars().all()
                collected.extend([_strip_answers(r.data) for r in rows])

            # If total < count, fill remainder randomly from the chapter
            if len(collected) < count:
                existing_ids = {q["question_id"] for q in collected}
                extra_needed = count - len(collected)
                filler_rows = (await db.execute(
                    select(MainQuestion)
                    .where(
                        MainQuestion.subject == subject,
                        MainQuestion.chapter == chapter,
                        MainQuestion.is_active == True,
                        MainQuestion.question_id.notin_(existing_ids),
                    )
                    .order_by(text("RANDOM()"))
                    .limit(extra_needed)
                )).scalars().all()
                collected.extend([_strip_answers(r.data) for r in filler_rows])

            questions = collected

    else:  # mode=mock
        # Get distinct chapters for this subject
        chapter_rows = (await db.execute(
            select(MainQuestion.chapter)
            .where(MainQuestion.subject == subject, MainQuestion.is_active == True)
            .distinct()
        )).scalars().all()

        chapters = list(chapter_rows)
        if not chapters:
            return {"questions": [], "total": 0}

        per_chapter = count // len(chapters)
        remainder = count % len(chapters)

        for i, ch in enumerate(chapters):
            ch_count = per_chapter + (1 if i < remainder else 0)
            if ch_count == 0:
                continue
            rows = (await db.execute(
                select(MainQuestion)
                .where(
                    MainQuestion.subject == subject,
                    MainQuestion.chapter == ch,
                    MainQuestion.is_active == True,
                )
                .order_by(text("RANDOM()"))
                .limit(ch_count)
            )).scalars().all()
            questions.extend([_strip_answers(r.data) for r in rows])

    return {"questions": questions, "total": len(questions)}


# ---------------------------------------------------------------------------
# Check answers
# ---------------------------------------------------------------------------

@router.post("/check-answers", response_model=AnswerCheckResult)
async def check_answers(
    body: AnswerCheckRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Validate student answers. Returns correct/incorrect per question with explanations."""
    results: dict[str, SingleAnswerResult] = {}

    for qid in body.question_ids:
        student_answer = body.answers.get(qid)

        # Look in main_questions first
        row = (await db.execute(
            select(MainQuestion).where(MainQuestion.question_id == qid)
        )).scalar_one_or_none()

        if not row:
            row = (await db.execute(
                select(ExtraQuestion).where(ExtraQuestion.question_id == qid)
            )).scalar_one_or_none()

        if not row:
            results[qid] = SingleAnswerResult(correct=False, error="question not found")
            continue

        data = row.data
        correct_ids: list[str] = data.get("correct_option_ids", [])
        is_correct = student_answer in correct_ids if student_answer else False

        results[qid] = SingleAnswerResult(
            correct=is_correct,
            correct_option_ids=correct_ids,
            explanation=data.get("explanation", ""),
        )

    return AnswerCheckResult(results=results)


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@router.get("/pool/stats", response_model=PoolStatsResult)
async def get_pool_stats(
    subject: str = Query(...),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_secret),
):
    """Return question counts grouped by chapter and difficulty for a subject."""
    rows = (await db.execute(
        select(
            MainQuestion.chapter,
            MainQuestion.difficulty,
            func.count(MainQuestion.id).label("cnt"),
        )
        .where(MainQuestion.subject == subject, MainQuestion.is_active == True)
        .group_by(MainQuestion.chapter, MainQuestion.difficulty)
        .order_by(MainQuestion.chapter)
    )).all()

    chapter_map: dict[str, dict[str, int]] = {}
    for chapter, diff, cnt in rows:
        if chapter not in chapter_map:
            chapter_map[chapter] = {"easy": 0, "medium": 0, "hard": 0}
        chapter_map[chapter][diff] = cnt

    chapters = [
        ChapterStats(
            chapter=ch,
            counts=ChapterDifficultyCounts(
                easy=counts["easy"],
                medium=counts["medium"],
                hard=counts["hard"],
                total=sum(counts.values()),
            ),
        )
        for ch, counts in sorted(chapter_map.items())
    ]

    return PoolStatsResult(subject=subject, chapters=chapters)


# ---------------------------------------------------------------------------
# Toggle / Delete (searches main then extra)
# ---------------------------------------------------------------------------

@router.patch("/{question_id}/toggle")
async def toggle_question(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_secret),
):
    question_id = question_id.strip()
    row = (await db.execute(
        select(MainQuestion).where(MainQuestion.question_id == question_id)
    )).scalar_one_or_none()

    if not row:
        row = (await db.execute(
            select(ExtraQuestion).where(ExtraQuestion.question_id == question_id)
        )).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Question not found")

    row.is_active = not row.is_active
    await db.commit()
    return {"question_id": question_id, "is_active": row.is_active}


@router.delete("/{question_id}")
async def delete_question(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_secret),
):
    question_id = question_id.strip()
    row = (await db.execute(
        select(MainQuestion).where(MainQuestion.question_id == question_id)
    )).scalar_one_or_none()

    if not row:
        row = (await db.execute(
            select(ExtraQuestion).where(ExtraQuestion.question_id == question_id)
        )).scalar_one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="Question not found")

    await db.delete(row)
    await db.commit()
    return {"deleted": True, "question_id": question_id}
