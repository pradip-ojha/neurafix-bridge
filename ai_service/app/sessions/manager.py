from __future__ import annotations

import json
import logging
from datetime import datetime, UTC

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_session import ChatMessage, ChatSession
from app.redis_client import lrange, rpush, set

logger = logging.getLogger(__name__)

_SESSION_TTL = 86400  # 24 hours
_MSG_KEY = "session:{session_id}:messages"


def _msg_key(session_id: str) -> str:
    return f"session:{session_id}:messages"


async def get_or_create_session(
    db: AsyncSession,
    user_id: str,
    subject: str,
    agent_type: str = "tutor",
) -> ChatSession:
    today = datetime.now(UTC).date()
    stmt = (
        select(ChatSession)
        .where(
            ChatSession.user_id == user_id,
            ChatSession.subject == subject,
            ChatSession.agent_type == agent_type,
            ChatSession.session_date == today,
        )
        .order_by(ChatSession.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if session:
        return session

    session = ChatSession(
        user_id=user_id,
        agent_type=agent_type,
        subject=subject,
        session_date=today,
        title="New Session",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def update_session_title(db: AsyncSession, session_id: str, title: str) -> None:
    session = await db.get(ChatSession, session_id)
    if session and session.title == "New Session":
        session.title = title[:60]
        await db.commit()


async def append_message(
    db: AsyncSession,
    session_id: str,
    role: str,
    content: str,
    metadata: dict | None = None,
) -> ChatMessage:
    msg = ChatMessage(
        session_id=session_id,
        role=role,
        content=content,
        metadata_=metadata,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Cache in Redis (append to tail for chronological order)
    key = _msg_key(session_id)
    payload = json.dumps({"role": role, "content": content, "created_at": msg.created_at.isoformat()})
    await rpush(key, payload)
    # Reset TTL on every new message
    await set(f"{key}:ttl_marker", "1", ex=_SESSION_TTL)

    return msg


async def get_recent_messages(db: AsyncSession, session_id: str, n: int = 10) -> list[dict]:
    key = _msg_key(session_id)
    # lrange returns chronological order since we use rpush
    raw_list = await lrange(key, -n, -1)
    if raw_list:
        messages = []
        for item in raw_list:
            try:
                messages.append(json.loads(item))
            except Exception:
                pass
        return messages

    # Cache miss — fall back to DB
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
        .limit(n)
    )
    # Get last n by doing a subquery workaround: get all, take last n
    stmt_all = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(n)
    )
    result = await db.execute(stmt_all)
    rows = list(reversed(result.scalars().all()))
    return [{"role": r.role, "content": r.content, "created_at": r.created_at.isoformat()} for r in rows]


async def count_messages(db: AsyncSession, session_id: str) -> int:
    stmt = select(ChatMessage).where(ChatMessage.session_id == session_id)
    result = await db.execute(stmt)
    return len(result.scalars().all())
