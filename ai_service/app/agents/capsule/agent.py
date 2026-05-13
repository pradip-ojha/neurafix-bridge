from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, UTC
from typing import AsyncGenerator

from agents import Agent, Runner, RawResponsesStreamEvent
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.model_router import ROLES, get_azure_client, get_model
from app.agents.capsule.prompts import build_generation_prompt, build_chat_system_prompt
from app.models.personalization import DailyCapsule
from app.personalization import context_builder

logger = logging.getLogger(__name__)


def _normalize_capsule_json(raw: str) -> str:
    """Parse, validate, and re-serialize capsule JSON. Falls back to raw text on failure."""
    clean = raw.strip()
    # Strip markdown code fences if present
    if clean.startswith("```"):
        lines = clean.split("\n")
        clean = "\n".join(lines[1:-1] if lines and lines[-1].strip() == "```" else lines[1:])
    clean = clean.strip()
    try:
        parsed = json.loads(clean)
        sections = parsed.get("sections", [])
        if not sections or len(sections) != 5:
            raise ValueError(f"Expected 5 sections, got {len(sections)}")
        return json.dumps(parsed, ensure_ascii=False)
    except Exception as exc:
        logger.warning("Capsule JSON parse/validate failed (%s) — storing raw text fallback", exc)
        return raw


class CapsuleAgent:
    def __init__(self, user_id: str, subject: str):
        self.user_id = user_id
        self.subject = subject

    # ------------------------------------------------------------------
    # Generation mode — called by internal endpoint; saves to DB
    # ------------------------------------------------------------------

    async def generate_and_save(self, db: AsyncSession, capsule_date=None) -> str:
        """Generate today's capsule and upsert into daily_capsules. Returns content."""
        from datetime import date as date_type
        if capsule_date is None:
            capsule_date = datetime.now(UTC).date()

        student_context, _ = await context_builder.build_capsule_context(
            db, self.user_id, self.subject
        )

        system_prompt = build_generation_prompt(self.subject, student_context)
        client = get_azure_client()
        resp = await client.chat.completions.create(
            model=ROLES["capsule_gen"],
            messages=[{"role": "user", "content": system_prompt}],
            temperature=0.4,
            response_format={"type": "json_object"},
        )
        raw_content = resp.choices[0].message.content or ""
        content = _normalize_capsule_json(raw_content)

        # Upsert
        stmt = select(DailyCapsule).where(
            DailyCapsule.user_id == self.user_id,
            DailyCapsule.subject == self.subject,
            DailyCapsule.capsule_date == capsule_date,
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            existing.content = content
            existing.created_at = datetime.now(UTC)
        else:
            db.add(DailyCapsule(
                id=str(uuid.uuid4()),
                user_id=self.user_id,
                subject=self.subject,
                capsule_date=capsule_date,
                content=content,
            ))
        await db.commit()
        logger.info("Capsule saved for user=%s subject=%s date=%s", self.user_id, self.subject, capsule_date)
        return content

    # ------------------------------------------------------------------
    # Chat mode — SSE streaming; uses today's capsule as context
    # ------------------------------------------------------------------

    def _build_chat_agent(self, capsule_content: str, student_context: str) -> Agent:
        system_prompt = build_chat_system_prompt(self.subject, capsule_content, student_context)
        return Agent(
            name=f"Capsule-{self.subject}",
            instructions=system_prompt,
            tools=[],
            model=get_model("capsule_followup"),
        )

    async def stream_response(
        self,
        capsule_content: str,
        student_context: str,
        messages: list[dict],
        session_id: str,
    ) -> AsyncGenerator[str, None]:
        """Yield SSE-formatted strings for capsule chat."""
        agent = self._build_chat_agent(capsule_content, student_context)
        full_text = ""

        try:
            result = Runner.run_streamed(agent, input=messages)
            async for event in result.stream_events():
                if not isinstance(event, RawResponsesStreamEvent):
                    continue
                raw = event.data
                event_type = getattr(raw, "type", None)
                if event_type == "response.output_text.delta":
                    delta = getattr(raw, "delta", "")
                    if delta:
                        full_text += delta
                        yield f"data: {json.dumps({'chunk': delta})}\n\n"
        except Exception as exc:
            logger.error("CapsuleAgent stream error for user=%s subject=%s: %s", self.user_id, self.subject, exc)
            yield f"data: {json.dumps({'error': 'Stream failed. Please try again.'})}\n\n"

        yield f"data: {json.dumps({'done': True, 'session_id': session_id, 'full_text': full_text})}\n\n"
