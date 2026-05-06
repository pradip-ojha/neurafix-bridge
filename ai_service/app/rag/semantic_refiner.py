"""
LLM-based semantic refinement using gpt-4o-mini.

The chunker extracts topic_hint (from ## headings) and subtopic_hint (from ###
headings) from the markdown structure. These are passed to the LLM as
suggestions alongside the full list of valid topic_ids from the subject
structure. The LLM confirms or corrects topic/subtopic and assigns chunk_type.

This hybrid approach means:
- Topic assignment is almost always correct (heading context + structure list)
- LLM can correct the rare case where a chunk belongs to a different topic
- Output topic is always a valid topic_id from the structure
"""

from __future__ import annotations

import json
import logging
import re

from openai import AsyncOpenAI

from app.config import settings
from app.rag.schemas import RawChunk, RefinedChunk

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None
_BATCH_SIZE = 8
_MODEL = "gpt-4o-mini"

_SYSTEM_PROMPT = """\
You are an expert educational content classifier for the Nepali school curriculum (class 8–10, SEE exam preparation).

For each chunk you are given:
- suggested_topic: the topic derived from the ## section heading in the source file
- suggested_subtopic: the subtopic derived from the ### section heading (empty if none)
- The full list of valid topic_ids and their subtopic lists for this chapter

Your job per chunk:
1. **Confirm or correct the topic** — if the chunk content clearly belongs to the suggested_topic, keep it.
   Only change it if the content unmistakably belongs to a different topic in the list.
   The output topic MUST be one of the valid topic_ids listed in the structure. Never invent a new topic_id.
2. **Confirm or refine the subtopic** — use the suggested_subtopic if accurate, or pick the closest match
   from the structure's subtopic list for that topic. Keep it as a short descriptive string.
3. **Assign chunk_type**:
   - "objective_question": any MCQ, true/false, or fill-in-the-blank question
   - "example": a worked example, solved problem, or numerical illustration
   - "definition": a precise definition of a term or concept
   - "explanation": everything else (theory, derivation, notes, rules, concept explanation)
4. **Clean the text**: fix typos, normalise spacing. Keep ALL educational content intact.

Rules:
- Return exactly one output item per input chunk, in the same order.
- Do NOT discard, merge, or split chunks.
- topic must be a valid topic_id from the structure list — never invent one.

Return ONLY valid JSON:
{"chunks": [
  {
    "text": "cleaned chunk text",
    "topic": "valid_topic_id",
    "subtopic": "subtopic string",
    "chunk_type": "explanation"
  }
]}
"""


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


def _valid_topic_ids(chapter_structure: dict | None) -> set[str]:
    if not chapter_structure:
        return set()
    return {t["id"] for t in chapter_structure.get("topics", [])}


def _format_structure(chapter_structure: dict | None) -> str:
    if not chapter_structure:
        return "No structure available."
    lines = [f"Chapter: {chapter_structure.get('display_name', 'Unknown')}",
             "Valid topic_ids (use these exactly):"]
    for topic in chapter_structure.get("topics", []):
        lines.append(f"  topic_id: \"{topic['id']}\"  ({topic['display_name']})")
        subtopics = topic.get("subtopics", [])
        if subtopics:
            lines.append(f"    subtopics: {', '.join(subtopics)}")
    return "\n".join(lines)


def _slugify(text: str) -> str:
    return re.sub(r'[^a-z0-9]+', '_', text.lower()).strip('_') or "general"


def _best_topic_fallback(hint: str, chapter_structure: dict | None) -> str:
    """Deterministic fallback when LLM returns an invalid or missing topic_id."""
    if not hint:
        return "general"
    if not chapter_structure:
        return _slugify(hint)

    hint_lower = hint.lower().strip()
    topics = chapter_structure.get("topics", [])

    for topic in topics:
        if topic["display_name"].lower().strip() == hint_lower:
            return topic["id"]

    for topic in topics:
        name = topic["display_name"].lower()
        if hint_lower in name or name in hint_lower:
            return topic["id"]

    hint_words = set(hint_lower.split())
    best_id, best_score = None, 0
    for topic in topics:
        name_words = set(topic["display_name"].lower().split())
        overlap = len(hint_words & name_words)
        if overlap > best_score:
            best_score, best_id = overlap, topic["id"]
    if best_id and best_score >= max(1, len(hint_words) // 2):
        return best_id

    return _slugify(hint)


async def refine_chunks(
    raw_chunks: list[RawChunk],
    chapter_structure: dict | None,
    subject: str,
    chapter: str,
) -> list[RefinedChunk]:
    """
    Classify all raw chunks through gpt-4o-mini in batches.
    The LLM receives the heading-derived topic/subtopic hints as suggestions
    and the full structure's valid topic_ids. It confirms or corrects each.
    """
    client = _get_client()
    structure_text = _format_structure(chapter_structure)
    valid_ids = _valid_topic_ids(chapter_structure)
    refined: list[RefinedChunk] = []

    for batch_start in range(0, len(raw_chunks), _BATCH_SIZE):
        batch = raw_chunks[batch_start: batch_start + _BATCH_SIZE]

        chunk_parts = []
        for i, c in enumerate(batch):
            header = (
                f"[CHUNK {i + 1} | suggested_topic: {c.topic_hint!r}"
                + (f" | suggested_subtopic: {c.subtopic_hint!r}" if c.subtopic_hint else "")
                + "]"
            )
            chunk_parts.append(f"{header}\n{c.text}")

        chunks_text = "\n\n---\n\n".join(chunk_parts)

        try:
            response = await client.chat.completions.create(
                model=_MODEL,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            f"Subject: {subject}\nChapter: {chapter}\n\n"
                            f"Structure:\n{structure_text}\n\n"
                            f"Process these {len(batch)} chunks:\n\n{chunks_text}"
                        ),
                    },
                ],
                response_format={"type": "json_object"},
                temperature=0,
            )

            raw_json = response.choices[0].message.content or '{"chunks": []}'
            parsed = json.loads(raw_json)

            if isinstance(parsed, dict):
                items = parsed.get("chunks") or []
                if not items:
                    for v in parsed.values():
                        if isinstance(v, list):
                            items = v
                            break
            else:
                items = parsed if isinstance(parsed, list) else []

            logger.warning("[refiner] batch %d: %d items from LLM", batch_start, len(items))

            for i, item in enumerate(items):
                src = batch[i] if i < len(batch) else batch[-1]

                llm_topic = item.get("topic", "")
                # Validate LLM topic is in structure; fall back to deterministic if not
                if valid_ids and llm_topic not in valid_ids:
                    logger.warning(
                        "[refiner] LLM returned invalid topic_id %r for chunk %d — using fallback",
                        llm_topic, batch_start + i,
                    )
                    llm_topic = _best_topic_fallback(src.topic_hint, chapter_structure)

                refined.append(RefinedChunk(
                    text=item.get("text", src.text),
                    chapter=chapter,
                    topic=llm_topic,
                    subtopic=item.get("subtopic", src.subtopic_hint),
                    chunk_type=item.get("chunk_type", "explanation"),
                ))

        except Exception as exc:
            logger.warning(
                "Batch %d refinement failed: %s — using raw chunks as fallback", batch_start, exc
            )
            for c in batch:
                refined.append(RefinedChunk(
                    text=c.text,
                    chapter=chapter,
                    topic=_best_topic_fallback(c.topic_hint, chapter_structure),
                    subtopic=c.subtopic_hint,
                    chunk_type="explanation",
                ))

    return [r for r in refined if r.text.strip()]
