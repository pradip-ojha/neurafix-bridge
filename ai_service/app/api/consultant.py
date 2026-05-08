"""
Consultant agent API endpoints.

POST /api/consultant/chat                     → SSE stream
GET  /api/consultant/sessions                 → list all consultant sessions
GET  /api/consultant/sessions/{id}/messages   → messages in a session
GET  /api/consultant/timeline                 → current preparation timeline
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, UTC

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user_id
from app.database import get_db
from app.models.chat_session import ChatMessage, ChatSession
from app.models.personalization import AgentType
from app.personalization import context_builder, summary_manager
from app.schemas.chat import MessageOut, SessionOut
from app.sessions import manager as session_manager
from app.agents.consultant.agent import ConsultantAgent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/consultant", tags=["consultant"])


class ConsultantChatRequest(BaseModel):
    message: str
    session_id: str | None = None


@router.post("/chat")
async def chat(
    req: ConsultantChatRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Stream a consultant response as SSE."""
    if req.session_id:
        session = await db.get(ChatSession, req.session_id)
        if not session or session.user_id != user_id:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        # Always create a new session — consultant supports multiple sessions per day
        session = ChatSession(
            user_id=user_id,
            agent_type=AgentType.consultant,
            subject=None,
            session_date=datetime.now(UTC).date(),
            title="New Session",
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)

    session_id = session.id

    await session_manager.append_message(db, session_id, "user", req.message)

    msg_count = await session_manager.count_messages(db, session_id)
    if msg_count <= 1:
        await session_manager.update_session_title(db, session_id, req.message)

    student_context = await context_builder.build_consultant_context(db, user_id, req.message)
    recent = await session_manager.get_recent_messages(db, session_id)
    messages = [{"role": m["role"], "content": m["content"]} for m in recent]

    consultant = ConsultantAgent(user_id=user_id, db=db)

    async def generate():
        full_text = ""
        async for chunk in consultant.stream_response(student_context, messages, session_id):
            if '"done": true' in chunk or '"done":true' in chunk:
                try:
                    data = json.loads(chunk[len("data: "):].strip())
                    full_text = data.get("full_text", "")
                except Exception:
                    pass
            yield chunk

        if full_text:
            await session_manager.append_message(
                db, session_id, "assistant", full_text, user_id=user_id
            )

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(ChatSession)
        .where(
            ChatSession.user_id == user_id,
            ChatSession.agent_type == AgentType.consultant,
        )
        .order_by(ChatSession.session_date.desc(), ChatSession.created_at.desc())
    )
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


@router.get("/timeline")
async def get_timeline(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    timeline = await summary_manager.get_consultant_timeline(db, user_id)
    if not timeline:
        return {"content": None, "version": 0, "updated_at": None}
    return {
        "content": timeline.content,
        "version": timeline.version,
        "updated_at": timeline.last_updated.isoformat() if timeline.last_updated else None,
    }
