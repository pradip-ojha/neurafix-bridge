"""
Tutor agent API endpoints.

POST /api/tutor/chat                         → SSE stream
GET  /api/tutor/sessions                     → list sessions
GET  /api/tutor/sessions/{id}/messages       → list messages in a session
GET  /api/tutor/personalization/summaries    → list summaries
GET  /api/tutor/personalization/timeline     → planner timeline
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user_id
from app.database import get_db
from app.models.chat_session import ChatSession, ChatMessage
from app.models.personalization import PersonalizationSummary, PlannerTimeline
from app.personalization import context_builder
from app.personalization import summary_manager
from app.schemas.chat import ChatRequest, MessageOut, SessionOut
from app.schemas.personalization import PlannerTimelineOut, SummaryOut
from app.sessions import manager as session_manager
from app.agents.tutor.agent import TutorAgent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tutor", tags=["tutor"])


@router.post("/chat")
async def chat(
    req: ChatRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Stream a tutor response as SSE (text/event-stream)."""
    # Resolve or create today's session
    if req.session_id:
        session = await db.get(ChatSession, req.session_id)
        if not session or session.user_id != user_id:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        session = await session_manager.get_or_create_session(db, user_id, req.subject)

    session_id = session.id

    # Persist user message
    user_msg = await session_manager.append_message(db, session_id, "user", req.message)

    # Auto-title on first message
    msg_count = await session_manager.count_messages(db, session_id)
    if msg_count <= 1:
        await session_manager.update_session_title(db, session_id, req.message)

    # Build personalization context (also gives us the student's stream)
    student_context, student_stream = await context_builder.build_context(db, user_id, req.subject)

    # Recent message history for conversation continuity
    recent = await session_manager.get_recent_messages(db, session_id, n=10)
    # Format for OpenAI Agents SDK input
    messages = [{"role": m["role"], "content": m["content"]} for m in recent]

    agent = TutorAgent(user_id=user_id, subject=req.subject, stream=student_stream)

    async def generate():
        full_text = ""
        async for chunk in agent.stream_response(student_context, messages, session_id):
            # Capture full_text from the final done event so we can persist it
            if '"done": true' in chunk or '"done":true' in chunk:
                import json as _json
                try:
                    data = _json.loads(chunk[len("data: "):].strip())
                    full_text = data.get("full_text", "")
                except Exception:
                    pass
            yield chunk

        # Persist assistant response to DB after stream ends
        if full_text:
            await session_manager.append_message(db, session_id, "assistant", full_text)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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

    # Map metadata_ column to metadata field in schema
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


@router.get("/personalization/summaries", response_model=list[SummaryOut])
async def list_summaries(
    agent_type: str | None = Query(default=None),
    subject: str | None = Query(default=None),
    timeline: str | None = Query(default=None),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    return await summary_manager.list_summaries(db, user_id, agent_type, subject, timeline)


@router.get("/personalization/timeline", response_model=PlannerTimelineOut | None)
async def get_timeline(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PlannerTimeline).where(PlannerTimeline.user_id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
