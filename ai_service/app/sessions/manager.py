from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, UTC

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.model_router import ROLES, get_azure_client
from app.models.chat_session import ChatMessage, ChatSession
from app.models.personalization import SessionMemory
from app.redis_client import lrange, rpush, set

logger = logging.getLogger(__name__)

_SESSION_TTL = 86400  # 24 hours


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
    user_id: str | None = None,
    subject: str | None = None,
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
    await set(f"{key}:ttl_marker", "1", ex=_SESSION_TTL)

    # Trigger session memory generation after assistant messages at count 5, 8, 11, ...
    if role == "assistant" and user_id:
        count = await count_messages(db, session_id)
        if count >= 5 and (count - 5) % 3 == 0:
            asyncio.create_task(
                _generate_and_save_session_memory(session_id, user_id, subject, count)
            )

    return msg


async def get_recent_messages(db: AsyncSession, session_id: str, n: int = 6) -> list[dict]:
    key = _msg_key(session_id)
    stmt_mem = select(SessionMemory).where(SessionMemory.session_id == session_id)

    # Fetch Redis messages and session memory in parallel
    raw_list, mem_result = await asyncio.gather(
        lrange(key, -n, -1),
        db.execute(stmt_mem),
    )

    if raw_list:
        messages = []
        for item in raw_list:
            try:
                messages.append(json.loads(item))
            except Exception:
                pass
    else:
        # Cache miss — fall back to DB
        stmt_all = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(n)
        )
        result = await db.execute(stmt_all)
        rows = list(reversed(result.scalars().all()))
        messages = [{"role": r.role, "content": r.content, "created_at": r.created_at.isoformat()} for r in rows]

    memory = mem_result.scalar_one_or_none()
    if memory:
        messages = [{"role": "system", "content": f"[Session Memory — Context from earlier in this conversation]\n{memory.content}"}] + messages

    return messages


async def count_messages(db: AsyncSession, session_id: str) -> int:
    stmt = select(ChatMessage).where(ChatMessage.session_id == session_id)
    result = await db.execute(stmt)
    return len(result.scalars().all())


async def _generate_and_save_session_memory(
    session_id: str,
    user_id: str,
    subject: str | None,
    message_count: int,
) -> None:
    """Background task — generates a session memory summary and upserts it."""
    from app.database import AsyncSessionLocal
    from app.personalization import summary_manager

    try:
        async with AsyncSessionLocal() as db:
            stmt = (
                select(ChatMessage)
                .where(ChatMessage.session_id == session_id)
                .order_by(ChatMessage.created_at.desc())
                .limit(6)
            )
            result = await db.execute(stmt)
            rows = list(reversed(result.scalars().all()))

            if not rows:
                return

            conversation = "\n".join(
                f"{r.role.upper()}: {r.content}" for r in rows
            )

            client = get_azure_client()
            resp = await client.chat.completions.create(
                model=ROLES["session_memory"],
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are summarizing a tutoring conversation for future context. "
                            "In 3-5 sentences, note: key topics covered, any confusion the student had, "
                            "what explanations helped, and any unresolved questions."
                        ),
                    },
                    {"role": "user", "content": conversation},
                ],
                max_tokens=250,
            )

            memory_content = (resp.choices[0].message.content or "").strip()
            if memory_content:
                await summary_manager.upsert_session_memory(
                    db, session_id, user_id, subject, memory_content, message_count
                )

    except Exception as exc:
        logger.error("Session memory generation failed for session=%s: %s", session_id, exc)
