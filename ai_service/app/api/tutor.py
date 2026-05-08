"""
Tutor agent API endpoints.

POST /api/tutor/chat                         → SSE stream
GET  /api/tutor/sessions                     → list sessions
GET  /api/tutor/sessions/{id}/messages       → list messages in a session
GET  /api/tutor/history                      → session history filtered by subject / date
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date as date_type

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.auth import get_current_user_id
from app.database import AsyncSessionLocal, get_db
from app.models.chat_session import ChatSession, ChatMessage
from app.models.personalization import StudentLevel
from app.personalization import context_builder
from app.schemas.chat import ChatRequest, MessageOut, SessionOut
from app.sessions import manager as session_manager
from app.agents.tutor.agent import TutorAgent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tutor", tags=["tutor"])

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


async def _maybe_assign_level(user_id: str, subject: str) -> None:
    """Fire-and-forget: assign level if not yet set for this student+subject."""
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(StudentLevel).where(
                    StudentLevel.user_id == user_id,
                    StudentLevel.subject == subject,
                )
            )
            if result.scalar_one_or_none() is None:
                from app.agents.personalization.agent import assign_level
                await assign_level(db, user_id, subject)
    except Exception:
        logger.exception("Background level assignment failed: user=%s subject=%s", user_id, subject)


@router.post("/chat")
async def chat(
    req: ChatRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Stream a tutor response as SSE (text/event-stream)."""
    # Validate subject against student stream
    student_stream = await _get_student_stream(user_id)
    valid_subjects = _STREAM_SUBJECTS.get(student_stream, _STREAM_SUBJECTS["both"])
    if req.subject not in valid_subjects:
        raise HTTPException(
            status_code=400,
            detail=f"Subject '{req.subject}' is not available for stream '{student_stream}'.",
        )

    asyncio.create_task(_maybe_assign_level(user_id, req.subject))

    if req.session_id:
        session = await db.get(ChatSession, req.session_id)
        if not session or session.user_id != user_id:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        session = await session_manager.get_or_create_session(db, user_id, req.subject)

    session_id = session.id

    await session_manager.append_message(db, session_id, "user", req.message)

    msg_count = await session_manager.count_messages(db, session_id)
    if msg_count <= 1:
        await session_manager.update_session_title(db, session_id, req.message)

    # Build personalization context — pass already-fetched stream to avoid double profile fetch
    student_context, ctx_stream = await context_builder.build_tutor_context(
        db, user_id, req.subject, req.message, req.chapter, student_stream=student_stream
    )

    # Recent messages (last 6) with session memory prepended if available
    recent = await session_manager.get_recent_messages(db, session_id)
    messages = [{"role": m["role"], "content": m["content"]} for m in recent]

    agent = TutorAgent(
        user_id=user_id,
        subject=req.subject,
        stream=ctx_stream,
        chapter=req.chapter,
    )

    async def generate():
        full_text = ""
        async for chunk in agent.stream_response(student_context, messages, session_id):
            if '"done": true' in chunk or '"done":true' in chunk:
                import json as _json
                try:
                    data = _json.loads(chunk[len("data: "):].strip())
                    full_text = data.get("full_text", "")
                except Exception:
                    pass
            yield chunk

        if full_text:
            await session_manager.append_message(
                db, session_id, "assistant", full_text,
                user_id=user_id, subject=req.subject,
            )

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/history", response_model=list[SessionOut])
async def get_history(
    subject: str | None = Query(default=None),
    date: str | None = Query(default=None),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List tutor sessions filtered by subject and/or date (YYYY-MM-DD)."""
    stmt = (
        select(ChatSession)
        .where(ChatSession.user_id == user_id, ChatSession.agent_type == "tutor")
        .order_by(ChatSession.session_date.desc(), ChatSession.created_at.desc())
    )
    if subject:
        stmt = stmt.where(ChatSession.subject == subject)
    if date:
        try:
            parsed_date = date_type.fromisoformat(date)
            stmt = stmt.where(ChatSession.session_date == parsed_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format — use YYYY-MM-DD.")
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    subject: str | None = Query(default=None),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ChatSession)
        .where(ChatSession.user_id == user_id, ChatSession.agent_type == "tutor")
        .order_by(ChatSession.session_date.desc(), ChatSession.created_at.desc())
    )
    if subject:
        stmt = stmt.where(ChatSession.subject == subject)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/sessions/{session_id}/messages", response_model=list[MessageOut])
async def list_messages(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    stmt = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    return [
        MessageOut(
            id=r.id,
            role=r.role,
            content=r.content,
            metadata=r.metadata_,
            created_at=r.created_at,
        )
        for r in rows
    ]
