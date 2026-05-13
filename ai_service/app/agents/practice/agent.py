from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

from agents import Agent, Runner, RawResponsesStreamEvent

from app.agents.model_router import get_model
from app.agents.shared.rag_tool import make_rag_tool

logger = logging.getLogger(__name__)


def _build_system_prompt(subject: str, chapter: str, session_context: str) -> str:
    return f"""You are a practice review tutor for {subject}, chapter: {chapter}.

The student just completed a practice session. Below is the full session — each question, the student's answer, whether it was correct, the correct answer, and the explanation.

{session_context}

Your job:
- Answer follow-up questions about specific questions or concepts from this session.
- Explain why an answer was correct or wrong in clear, simple terms.
- Help the student understand mistakes and reinforce correct understanding.
- Use search_knowledge_base only if the student asks about something outside the session content above.
- Never reveal correct answers to questions that weren't in this session.
- Keep responses focused and educational. Do not be verbose."""


def _format_session_context(score_data: dict) -> str:
    """Format score_data into readable session context for the agent."""
    results: dict = score_data.get("results", {})
    total = score_data.get("total", 0)
    score = score_data.get("score", 0)

    lines = [f"Session Score: {score}/{total}\n"]

    for i, (qid, r) in enumerate(results.items(), 1):
        student_ans = r.get("student_answer") or "(no answer)"
        correct_ids = r.get("correct_option_ids", [])
        is_correct = r.get("correct", False)
        status = "CORRECT" if is_correct else "WRONG"
        explanation = r.get("explanation", "")
        topic = r.get("topic", "")

        q_data = r.get("question_data", {})
        question_text = q_data.get("question_text", qid)
        options = q_data.get("options", [])

        opt_lines = "  ".join(f"{o['id']}) {o['text']}" for o in options) if options else ""

        lines.append(
            f"Q{i} [{status}] (topic: {topic})\n"
            f"  Question: {question_text}\n"
            f"  Options: {opt_lines}\n"
            f"  Student answered: {student_ans} | Correct: {', '.join(correct_ids)}\n"
            f"  Explanation: {explanation}"
        )

    return "\n\n".join(lines)


class PracticeFollowupAgent:
    def __init__(self, subject: str, chapter: str, score_data: dict):
        self.subject = subject
        self.chapter = chapter
        self.session_context = _format_session_context(score_data)

    def _build_agent(self) -> Agent:
        system_prompt = _build_system_prompt(self.subject, self.chapter, self.session_context)
        rag_tool = make_rag_tool(self.subject, self.chapter)
        return Agent(
            name=f"PracticeFollowup-{self.subject}",
            instructions=system_prompt,
            tools=[rag_tool],
            model=get_model("capsule_followup"),
        )

    async def stream_response(
        self,
        messages: list[dict],
    ) -> AsyncGenerator[str, None]:
        agent = self._build_agent()
        full_text = ""

        try:
            result = Runner.run_streamed(agent, input=messages)
            async for event in result.stream_events():
                if not isinstance(event, RawResponsesStreamEvent):
                    continue
                raw = event.data
                if getattr(raw, "type", None) == "response.output_text.delta":
                    delta = getattr(raw, "delta", "")
                    if delta:
                        full_text += delta
                        yield f"data: {json.dumps({'chunk': delta})}\n\n"
        except Exception as exc:
            logger.error("PracticeFollowupAgent stream error: %s", exc)
            yield f"data: {json.dumps({'error': 'Stream failed. Please try again.'})}\n\n"

        yield f"data: {json.dumps({'done': True, 'full_text': full_text})}\n\n"
