"""
Student capsule endpoints — JWT-authenticated.

GET  /api/capsule/{subject}              → today's capsule (or latest)
GET  /api/capsule/{subject}/history      → list of capsule dates
GET  /api/capsule/{subject}/{date}       → capsule for specific date
POST /api/capsule/{subject}/chat         → SSE stream (capsule chat)
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
from app.models.chat_session import ChatSession
from app.models.personalization import AgentType, DailyCapsule
from app.personalization import context_builder
from app.sessions import manager as session_manager
from app.agents.capsule.agent import CapsuleAgent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/capsule", tags=["capsule"])


# ---------------------------------------------------------------------------
# GET today's capsule
# ---------------------------------------------------------------------------

@router.get("/{subject}")
async def get_today_capsule(
    subject: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    today = datetime.now(UTC).date()
    stmt = select(DailyCapsule).where(
        DailyCapsule.user_id == user_id,
        DailyCapsule.subject == subject,
        DailyCapsule.capsule_date == today,
    )
    result = await db.execute(stmt)
    capsule = result.scalar_one_or_none()

    if not capsule:
        # Fall back to latest if today's not ready
        stmt2 = (
            select(DailyCapsule)
            .where(
                DailyCapsule.user_id == user_id,
                DailyCapsule.subject == subject,
            )
            .order_by(DailyCapsule.capsule_date.desc())
            .limit(1)
        )
        result2 = await db.execute(stmt2)
        capsule = result2.scalar_one_or_none()

    if not capsule:
        return {"status": "not_generated", "content": None, "capsule_date": None}

    return {
        "status": "ok",
        "id": capsule.id,
        "subject": capsule.subject,
        "capsule_date": str(capsule.capsule_date),
        "content": capsule.content,
        "created_at": capsule.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# GET capsule history
# ---------------------------------------------------------------------------

@router.get("/{subject}/history")
async def get_capsule_history(
    subject: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(DailyCapsule)
        .where(
            DailyCapsule.user_id == user_id,
            DailyCapsule.subject == subject,
        )
        .order_by(DailyCapsule.capsule_date.desc())
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        {"id": r.id, "capsule_date": str(r.capsule_date), "created_at": r.created_at.isoformat()}
        for r in rows
    ]


# ---------------------------------------------------------------------------
# GET specific date capsule
# ---------------------------------------------------------------------------

@router.get("/{subject}/{capsule_date}")
async def get_capsule_by_date(
    subject: str,
    capsule_date: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    from datetime import date as date_type
    try:
        parsed_date = date_type.fromisoformat(capsule_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    stmt = select(DailyCapsule).where(
        DailyCapsule.user_id == user_id,
        DailyCapsule.subject == subject,
        DailyCapsule.capsule_date == parsed_date,
    )
    result = await db.execute(stmt)
    capsule = result.scalar_one_or_none()

    if not capsule:
        raise HTTPException(status_code=404, detail="Capsule not found for this date.")

    return {
        "status": "ok",
        "id": capsule.id,
        "subject": capsule.subject,
        "capsule_date": str(capsule.capsule_date),
        "content": capsule.content,
        "created_at": capsule.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# POST capsule chat (SSE)
# ---------------------------------------------------------------------------

class CapsuleChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    capsule_date: str | None = None  # defaults to today


@router.post("/{subject}/chat")
async def capsule_chat(
    subject: str,
    req: CapsuleChatRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Stream a capsule chat response as SSE."""
    from datetime import date as date_type

    # Resolve capsule date
    if req.capsule_date:
        try:
            cap_date = date_type.fromisoformat(req.capsule_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid capsule_date format.")
    else:
        cap_date = datetime.now(UTC).date()

    # Fetch capsule content for context
    stmt = select(DailyCapsule).where(
        DailyCapsule.user_id == user_id,
        DailyCapsule.subject == subject,
        DailyCapsule.capsule_date == cap_date,
    )
    result = await db.execute(stmt)
    capsule = result.scalar_one_or_none()
    capsule_content = capsule.content if capsule else "[No capsule generated for this date yet]"

    # Session management
    if req.session_id:
        session = await db.get(ChatSession, req.session_id)
        if not session or session.user_id != user_id:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        session = ChatSession(
            user_id=user_id,
            agent_type=AgentType.capsule,
            subject=subject,
            session_date=cap_date,
            title="Capsule Chat",
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)

    session_id = session.id
    await session_manager.append_message(db, session_id, "user", req.message)

    # Build student context for the agent
    student_context, _ = await context_builder.build_capsule_context(db, user_id, subject)
    recent = await session_manager.get_recent_messages(db, session_id)
    messages = [{"role": m["role"], "content": m["content"]} for m in recent]

    agent = CapsuleAgent(user_id=user_id, subject=subject)

    async def generate():
        full_text = ""
        async for chunk in agent.stream_response(capsule_content, student_context, messages, session_id):
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
