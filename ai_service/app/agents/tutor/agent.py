from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from agents import Agent, Runner, RawResponsesStreamEvent

from app.agents.model_router import get_model
from app.agents.shared.rag_tool import make_rag_tool
from app.agents.tutor.prompts import build_system_prompt

logger = logging.getLogger(__name__)


class TutorAgent:
    def __init__(self, user_id: str, subject: str, stream: str = "both", chapter: str | None = None, mode: str = "fast"):
        self.user_id = user_id
        self.subject = subject
        self.stream = stream
        self.chapter = chapter
        self.mode = mode

    def _build_agent(self, student_context: str) -> Agent:
        system_prompt = build_system_prompt(self.subject, student_context)
        tools = [make_rag_tool(self.subject, self.chapter)] if self.mode == "deep_thinking" else []
        model_role = "tutor_fast" if self.mode == "fast" else "tutor_thinking"
        return Agent(
            name=f"Tutor-{self.subject}",
            instructions=system_prompt,
            tools=tools,
            model=get_model(model_role),
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
                # OpenAI Responses API delta events
                event_type = getattr(raw, "type", None)
                if event_type == "response.output_text.delta":
                    delta = getattr(raw, "delta", "")
                    if delta:
                        full_text += delta
                        yield f"data: {json.dumps({'chunk': delta})}\n\n"
        except Exception as exc:
            logger.error("TutorAgent stream error for user=%s subject=%s: %s", self.user_id, self.subject, exc)
            yield f"data: {json.dumps({'error': 'Stream failed. Please try again.'})}\n\n"

        yield f"data: {json.dumps({'done': True, 'session_id': session_id, 'full_text': full_text})}\n\n"
