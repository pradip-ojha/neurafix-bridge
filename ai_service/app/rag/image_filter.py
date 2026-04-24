"""
Vision-based image filter using gpt-4o-mini.

Each image is assessed with full context (chapter, topic, nearby text) before
uploading to R2. Three outcomes are possible:

  A) EDUCATIONAL — useful diagram/graph/figure → upload, return description
  B) FORMULA     — image is primarily a formula/equation → extract formula as
                   plain text, discard image (no upload needed once extracted)
  C) DECORATIVE  — borders, logos, portraits, ornaments → discard silently

Returns: (useful: bool, description: str, topics: list[str], formula: str)
  - useful=True   → caller should upload the image
  - useful=False, formula non-empty → caller should append formula to chunk text
  - useful=False, formula empty    → discard entirely
"""

from __future__ import annotations

import base64
import json
import logging

from openai import AsyncOpenAI

from app.config import settings

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None

_FILTER_PROMPT = """\
You are reviewing an image extracted from a school textbook (Nepali curriculum, class 8–10).

CONTEXT PROVIDED:
- Chapter: {chapter}
- Topic: {topic}
- Nearby text (excerpt from the same section):
  \"\"\"{nearby_text}\"\"\"

Using this context, classify the image into exactly ONE of three categories:

CATEGORY A — EDUCATIONAL IMAGE
An image that visually explains or illustrates a concept and cannot be replaced by text alone.
Examples: scientific diagrams (cell, circuit, body organ, plant), geographic maps,
graphs, coordinate planes, geometric constructions, illustrated experiments,
labeled figures, physics force diagrams, chemical structure diagrams,
tables that show data or comparisons visually.
→ Keep this image.

CATEGORY B — FORMULA / EQUATION IMAGE
An image whose entire or primary content is a mathematical, chemical, or physical formula,
equation, or symbolic expression (e.g., E = mc², H₂O → H₂ + ½O₂, ∫f(x)dx, F = ma).
The formula can be extracted as text so the image is not needed.
→ Discard image but extract the formula/expression as plain text.

CATEGORY C — DECORATIVE / IRRELEVANT / OCR ARTIFACT
Any of the following:
  - Purely ornamental: page borders, watermarks, publisher logos, author portraits,
    background textures, bullet symbols, blank images, tiny icons.
  - OCR TEXT FRAGMENT: An image that contains only rendered text — a word, a partial
    sentence, a sentence fragment, or a short phrase. These are OCR artifacts where
    a piece of running body text was incorrectly embedded as an image during document
    conversion. They look like a screenshot of a few words with no visual structure.
    Even if the text is educational (e.g. "ing to the formula", "the speed of light"),
    it is CATEGORY C because the content is text and belongs in the text stream.
  - Single decorative symbol or bullet rendered as image.
→ Discard image, no extraction needed.

Respond with JSON only — no other text:
{{
  "category": "A" or "B" or "C",
  "description": "One sentence: what does this image show? (Write 'decorative element' for C)",
  "topics": ["topic1"],
  "formula": "extracted formula/equation as plain text (only for category B, else empty string)"
}}
"""


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


async def filter_image(
    png_bytes: bytes,
    chapter: str = "",
    topic: str = "",
    nearby_text: str = "",
) -> tuple[bool, str, list[str], str]:
    """
    Returns (is_useful, description, topics, formula).

    is_useful=True  → upload image to R2
    is_useful=False, formula non-empty → attach formula to chunk, discard image
    is_useful=False, formula empty     → discard silently

    Uses gpt-4o-mini with detail=low for cost efficiency.
    Fails open: on API error the image is kept as-is.
    """
    try:
        b64 = base64.b64encode(png_bytes).decode()
        prompt = _FILTER_PROMPT.format(
            chapter=chapter or "Unknown",
            topic=topic or "Unknown",
            nearby_text=(nearby_text[:500] if nearby_text else "not available"),
        )
        client = _get_client()
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{b64}",
                                "detail": "low",
                            },
                        },
                    ],
                }
            ],
            response_format={"type": "json_object"},
            max_tokens=200,
            temperature=0,
        )
        result = json.loads(response.choices[0].message.content or '{"category": "A"}')
        category = str(result.get("category", "A")).upper()
        description = str(result.get("description", ""))
        topics = list(result.get("topics", []))
        formula = str(result.get("formula", ""))

        if category == "A":
            logger.info("[image_filter] KEEP  ch=%s desc=%s", chapter, description)
            return True, description, topics, ""
        elif category == "B":
            logger.info("[image_filter] FORMULA ch=%s → %s", chapter, formula)
            return False, description, topics, formula
        else:
            logger.info("[image_filter] DISCARD ch=%s desc=%s", chapter, description)
            return False, description, topics, ""

    except Exception as exc:
        logger.warning("[image_filter] API error — keeping image: %s", exc)
        return True, "", [], ""
