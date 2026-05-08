"""
Classifies student queries for routing decisions.

classify_tutor_query   — decides whether RAG retrieval is needed for a tutor message
classify_consultant_query — decides which context slice to assemble for the consultant
"""
from __future__ import annotations

import json
import logging

from app.agents.base_agent import get_openai_client

logger = logging.getLogger(__name__)

_CLASSIFIER_MODEL = "gpt-4o-mini"

_SYSTEM_PROMPT = """\
You are a query classifier for an educational AI tutor. Given a student's message, \
classify whether it requires deep knowledge retrieval (RAG) from the curriculum.

Respond ONLY with a JSON object — no markdown, no explanation:
{
  "needs_rag": true or false,
  "chapter": "<chapter id string or null>",
  "topic": "<topic id string or null>",
  "chunk_type": "explanation" or "example" or null
}

Rules:
- needs_rag = FALSE for: simple recall ("what is X", "define X", "give me the formula for X"), \
spelling/vocabulary checks, yes/no factual questions, greetings, off-topic messages.
- needs_rag = TRUE for: conceptual questions ("why", "how", "explain"), confusion or \
follow-up on a previous explanation, problem-solving with worked steps needed, \
any question requiring in-depth curriculum knowledge.
- chapter: if you can infer the chapter id (e.g. "arithmetic", "algebra") from context, \
provide it; otherwise null.
- topic: if you can infer the topic id within that chapter, provide it; otherwise null.
- chunk_type: "explanation" for conceptual questions, "example" for worked-example questions, \
null when not clear.
"""


async def classify_tutor_query(
    message: str,
    subject: str,
    chapter: str | None,
) -> dict:
    """Return classification dict for a student tutor message.

    Never raises — falls back to needs_rag=True on any error (fail open).
    """
    user_content = (
        f"Subject: {subject}\n"
        f"Current chapter: {chapter or 'not specified'}\n"
        f"Student message: {message}"
    )
    try:
        client = get_openai_client()
        response = await client.chat.completions.create(
            model=_CLASSIFIER_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
            max_tokens=100,
            temperature=0,
        )
        raw = (response.choices[0].message.content or "").strip()
        result = json.loads(raw)
        return {
            "needs_rag": bool(result.get("needs_rag", True)),
            "chapter": result.get("chapter") or chapter,
            "topic": result.get("topic") or None,
            "chunk_type": result.get("chunk_type") or None,
        }
    except Exception as exc:
        logger.warning("Classifier failed (fail-open): %s", exc)
        return {"needs_rag": True, "chapter": chapter, "topic": None, "chunk_type": None}


_CONSULTANT_SYSTEM_PROMPT = """\
You are a classifier for a student consultant AI.

Given a student's message, decide whether it requires deep subject-level data about the student \
(their practice scores, weekly summaries, subject-specific mistakes, session memories) to answer well.

Classify as "student_performance" when the answer would meaningfully improve by knowing the \
student's subject-wise performance details. This includes:
- Questions about their own mistakes, errors, or confusion in a subject \
  ("where am I going wrong in science", "why do I keep failing math")
- Questions about their own scores or practice results \
  ("why is my score low", "how did I do this week")
- Questions about their own weak or strong topics \
  ("what topics am I weak in", "what should I focus on")
- Study strategy or improvement questions — because effective advice depends on \
  knowing whether the student struggles with concepts, calculations, time pressure, \
  question types, etc. ("how should I study", "how can I improve", "what study method works for me")
- Preparation plan creation or updates — because a good plan must reflect the student's \
  current per-subject performance and weak areas \
  ("update my plan", "create a study plan", "change my schedule", "revise the timeline")

Classify as "general" for questions where subject-level performance data adds no value:
- Career guidance — answer depends on student's interests and goals, not their subject scores \
  ("what career should I choose", "careers after science", "what can I become")
- College or stream choice ("which college is good", "is science hard", "which stream suits me")
- Motivation, stress, anxiety ("I'm feeling demotivated", "I'm scared of the exam")
- Greetings and open-ended chat ("hi", "how are you", "thank you")
- Questions about external information ("what is the syllabus", "when is the entrance exam")

Respond ONLY with a JSON object — no markdown, no explanation:
{"query_type": "student_performance" | "general"}
"""


async def classify_consultant_query(message: str) -> dict:
    """Return {"query_type": "student_performance" | "general"}.

    student_performance → full context (subject summaries + practice + session memories)
    general             → lean context (profile + overall summary + timeline only)

    Never raises — fails open to "general" (lean) since it is the safer default
    when the student's subject data is not clearly needed.
    """
    try:
        client = get_openai_client()
        response = await client.chat.completions.create(
            model=_CLASSIFIER_MODEL,
            messages=[
                {"role": "system", "content": _CONSULTANT_SYSTEM_PROMPT},
                {"role": "user", "content": message},
            ],
            response_format={"type": "json_object"},
            max_tokens=30,
            temperature=0,
        )
        raw = (response.choices[0].message.content or "").strip()
        result = json.loads(raw)
        query_type = result.get("query_type", "general")
        if query_type not in ("student_performance", "general"):
            query_type = "general"
        return {"query_type": query_type}
    except Exception as exc:
        logger.warning("Consultant classifier failed (fail-open to general): %s", exc)
        return {"query_type": "general"}
