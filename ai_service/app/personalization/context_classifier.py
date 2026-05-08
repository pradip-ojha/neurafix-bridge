"""
Classifies a student's tutor query to decide whether RAG retrieval is needed.
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
