from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from agents import Agent, Runner, RawResponsesStreamEvent, function_tool
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.model_router import get_model
from app.agents.consultant.prompts import build_system_prompt
from app.personalization import summary_manager

logger = logging.getLogger(__name__)


class ConsultantAgent:
    def __init__(self, user_id: str, db: AsyncSession, mode: str = "normal"):
        self.user_id = user_id
        self.db = db
        self.mode = mode

    def _make_tools(self) -> list:
        db = self.db
        user_id = self.user_id

        @function_tool
        async def update_timeline(content: str) -> str:
            """Update the student's preparation timeline with new plan content. Call this immediately when the student asks to change their plan."""
            await summary_manager.save_consultant_timeline(db, user_id, content)
            return "Timeline updated successfully."

        @function_tool
        async def get_subject_progress(subject: str) -> str:
            """Get the student's all-time and weekly progress summary for a specific subject. Subject must be one of: compulsory_math, optional_math, compulsory_english, compulsory_science."""
            all_time = await summary_manager.get_or_placeholder(db, user_id, subject, "all_time")
            weekly = await summary_manager.get_or_placeholder(db, user_id, subject, "weekly")
            display = subject.replace("_", " ").title()
            return (
                f"## {display} — All-Time Progress\n{all_time}\n\n"
                f"## {display} — This Week\n{weekly}"
            )

        return [update_timeline, get_subject_progress]

    def _build_agent(self, student_context: str) -> Agent:
        return Agent(
            name="Consultant",
            instructions=build_system_prompt(student_context),
            tools=self._make_tools(),
            model=get_model("consultant"),
        )

    async def stream_response(
        self,
        student_context: str,
        messages: list[dict],
        session_id: str,
    ) -> AsyncGenerator[str, None]:
        """Yield SSE-formatted strings. Caller wraps in StreamingResponse."""
        agent = self._build_agent(student_context)
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
            logger.error("ConsultantAgent stream error for user=%s: %s", self.user_id, exc)
            yield f"data: {json.dumps({'error': 'Stream failed. Please try again.'})}\n\n"

        yield f"data: {json.dumps({'done': True, 'session_id': session_id, 'full_text': full_text})}\n\n"
