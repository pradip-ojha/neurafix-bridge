"""
LLM-based semantic refinement of raw chunks.

Changes from v1:
  - OCR error correction: GPT-4o fixes spelling, broken words, garbled formulas.
  - Image assignment: each output chunk receives only the images it actually
    references, identified by IMG_N indices in the batch.
  - Max 1000-token chunks: post-processing splits oversized chunks at paragraph
    boundaries (hard token split as fallback).
  - Overlap: 150-token overlap prepended to each chunk from the previous chunk.
"""

from __future__ import annotations

import json
import logging

import tiktoken
from openai import AsyncOpenAI

from app.config import settings
from app.rag.schemas import PageImage, RawChunk, RefinedChunk

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None
_BATCH_SIZE = 6

_MAX_TOKENS = 1000
_OVERLAP_RATIO = 0.15  # 15% of the previous chunk's token count

try:
    _ENC = tiktoken.encoding_for_model("gpt-4o")
except Exception:
    _ENC = tiktoken.get_encoding("cl100k_base")


# ── Token helpers ─────────────────────────────────────────────────────────────

def _token_count(text: str) -> int:
    return len(_ENC.encode(text))


def _decode_tokens(tokens: list[int]) -> str:
    return _ENC.decode(tokens)


# ── Prompt builder ────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are an expert educational content processor specializing in the Nepali school curriculum (class 8–10).

Your task: take raw text chunks (possibly extracted via OCR from a textbook) and return a clean, structured JSON list of refined chunks.

RULES:
1. Each refined chunk must represent EXACTLY ONE complete learning concept.
2. MERGE chunks that belong to the same concept (e.g., a definition that spills across two raw chunks).
3. SPLIT chunks that contain two or more distinct concepts — create a separate chunk for each.
4. Let content determine chunk size. A concise definition is small; a full derivation or worked example is large. Do NOT split a concept mid-explanation just to keep size uniform.
5. Only discard a chunk if it is purely a page number, a chapter number alone, or a decorative separator with zero educational content. Preserve ALL subject matter.
6. FIX OCR ERRORS: The text may have been extracted via OCR. Correct spelling errors, broken/joined words, garbled characters, and malformed formulas or equations. If a formula appears broken (e.g., "E=m c2" instead of "E=mc²"), reconstruct it correctly using context. Remove stray characters that are clearly OCR noise.
7. IMAGE ASSIGNMENT: A list of images found in this batch is provided above the chunks (IMG_0, IMG_1, ...). For each output chunk, set "assigned_image_indices" to the list of IMG indices whose image is directly referenced by, illustrated in, or most relevant to that chunk's content. If no image belongs to a chunk, use an empty list [].

For each chunk output:
  - "chapter"               : chapter name (infer from heading/context; "Unknown" if unclear)
  - "topic"                 : specific topic within the chapter
  - "chunk_type"            : "question" | "example" | "explanation" | "definition" | "diagram_description"
  - "text"                  : full corrected text (preserve equations, lists, table content)
  - "page_number"           : page number of the input chunk (first page if merging)
  - "assigned_image_indices": list of IMG_N indices (integers) that belong to this chunk

Return a JSON object with a single key "chunks":
{"chunks": [
  {
    "text": "Newton's First Law states that an object remains at rest...",
    "page_number": 12,
    "chapter": "Laws of Motion",
    "topic": "Newton's First Law",
    "chunk_type": "explanation",
    "assigned_image_indices": [0]
  }
]}

If the batch has truly no educational content, return {"chunks": []}.
"""


def _build_batch_context(
    chunks: list[RawChunk],
    image_map: dict[int, list[PageImage]],
) -> tuple[str, list[tuple[int, PageImage]]]:
    """
    Build prompt text and collect images for this batch.

    Returns:
        prompt_text  : full user-facing prompt (images section + chunks section)
        batch_images : [(global_index, PageImage)] for all images in this batch
    """
    # Collect unique images across pages touched by this batch
    batch_images: list[tuple[int, PageImage]] = []
    seen_pages: set[int] = set()
    for c in chunks:
        if c.page_number not in seen_pages:
            seen_pages.add(c.page_number)
            for pi in image_map.get(c.page_number, []):
                batch_images.append((len(batch_images), pi))

    # Build image listing section
    img_section = ""
    if batch_images:
        lines = [
            f"  [IMG_{idx}] (page {pi.page_number}) {pi.description or 'image'}"
            for idx, pi in batch_images
        ]
        img_section = "IMAGES IN THIS BATCH:\n" + "\n".join(lines) + "\n\n"

    # Build chunks section
    chunk_parts = []
    for i, c in enumerate(chunks):
        pre_assigned = ""
        if c.image_urls:
            pre_assigned = "\n[NOTE: this chunk has pre-assigned images — reflect them in assigned_image_indices if any match]"
        chunk_parts.append(
            f"[CHUNK {i + 1} | page {c.page_number} | heading: {c.chapter_hint or 'none'}]{pre_assigned}\n{c.text}"
        )

    return img_section + "\n\n---\n\n".join(chunk_parts), batch_images


# ── Post-processing: split + overlap ─────────────────────────────────────────

def _split_large_chunk(chunk: RefinedChunk) -> list[RefinedChunk]:
    """Split chunks exceeding MAX_TOKENS at paragraph boundaries; hard-split as fallback."""
    if _token_count(chunk.text) <= _MAX_TOKENS:
        return [chunk]

    paragraphs = chunk.text.split("\n\n")
    parts: list[RefinedChunk] = []
    current_text = ""
    is_first = True

    def _make_part(text: str) -> RefinedChunk:
        nonlocal is_first
        r = RefinedChunk(
            text=text.strip(),
            page_number=chunk.page_number,
            chapter=chunk.chapter,
            topic=chunk.topic,
            chunk_type=chunk.chunk_type,
            image_urls=chunk.image_urls if is_first else [],
            image_descriptions=chunk.image_descriptions if is_first else [],
        )
        is_first = False
        return r

    for para in paragraphs:
        candidate = (current_text + "\n\n" + para).strip() if current_text else para
        if _token_count(candidate) > _MAX_TOKENS and current_text:
            # Para would overflow — flush current, start fresh
            if _token_count(current_text) > _MAX_TOKENS:
                # current_text itself is too large — hard split by tokens
                toks = _ENC.encode(current_text)
                for i in range(0, len(toks), _MAX_TOKENS):
                    parts.append(_make_part(_decode_tokens(toks[i : i + _MAX_TOKENS])))
            else:
                parts.append(_make_part(current_text))
            current_text = para
        else:
            current_text = candidate

    if current_text.strip():
        if _token_count(current_text) > _MAX_TOKENS:
            toks = _ENC.encode(current_text)
            for i in range(0, len(toks), _MAX_TOKENS):
                parts.append(_make_part(_decode_tokens(toks[i : i + _MAX_TOKENS])))
        else:
            parts.append(_make_part(current_text))

    return parts if parts else [chunk]


def _add_overlap(chunks: list[RefinedChunk]) -> list[RefinedChunk]:
    """Prepend 15% of the previous chunk's tokens to each chunk as overlap context."""
    if len(chunks) <= 1:
        return chunks

    result: list[RefinedChunk] = [chunks[0]]
    for i in range(1, len(chunks)):
        prev_tokens = _ENC.encode(chunks[i - 1].text)
        overlap_n = max(1, int(len(prev_tokens) * _OVERLAP_RATIO))
        if len(prev_tokens) > overlap_n:
            overlap_text = _decode_tokens(prev_tokens[-overlap_n:])
        else:
            overlap_text = chunks[i - 1].text
        c = chunks[i]
        result.append(
            RefinedChunk(
                text=overlap_text + "\n\n" + c.text,
                page_number=c.page_number,
                chapter=c.chapter,
                topic=c.topic,
                chunk_type=c.chunk_type,
                image_urls=c.image_urls,
                image_descriptions=c.image_descriptions,
            )
        )
    return result


def _postprocess(refined: list[RefinedChunk]) -> list[RefinedChunk]:
    """Split oversized chunks, then add inter-chunk overlap."""
    split: list[RefinedChunk] = []
    for chunk in refined:
        split.extend(_split_large_chunk(chunk))
    return _add_overlap(split)


# ── Client ────────────────────────────────────────────────────────────────────

def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


# ── Main refiner ──────────────────────────────────────────────────────────────

async def refine_chunks(
    raw_chunks: list[RawChunk],
    image_map: dict[int, list[PageImage]],
    subject: str,
    book_title: str,
) -> list[RefinedChunk]:
    """
    Process all raw_chunks through GPT-4o in batches.
    Returns refined chunks with OCR corrections, smart image assignment,
    max-1000-token size, and 150-token overlap between chunks.
    """
    client = _get_client()
    refined: list[RefinedChunk] = []

    for batch_start in range(0, len(raw_chunks), _BATCH_SIZE):
        batch = raw_chunks[batch_start : batch_start + _BATCH_SIZE]
        prompt_text, batch_images = _build_batch_context(batch, image_map)

        try:
            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            f"Book: {book_title}\nSubject: {subject}\n\n"
                            f"Process these {len(batch)} chunks:\n\n{prompt_text}"
                        ),
                    },
                ],
                response_format={"type": "json_object"},
                temperature=0,
            )

            raw_json = response.choices[0].message.content or '{"chunks": []}'
            parsed = json.loads(raw_json)

            if isinstance(parsed, dict):
                items = parsed.get("chunks") or parsed.get("results") or parsed.get("items") or []
                if not items:
                    for v in parsed.values():
                        if isinstance(v, list):
                            items = v
                            break
            else:
                items = parsed if isinstance(parsed, list) else []

            logger.warning("[refiner] batch %d: %d items from GPT-4o", batch_start, len(items))

            # Build a lookup: global image index → PageImage
            img_lookup: dict[int, PageImage] = {idx: pi for idx, pi in batch_images}

            for item in items:
                page = item.get("page_number", batch[0].page_number)
                matching_chunk = next((c for c in batch if c.page_number == page), batch[0])

                # Smart image assignment via GPT-4o-assigned indices
                assigned_indices: list[int] = item.get("assigned_image_indices", [])
                if assigned_indices:
                    image_urls = [img_lookup[i].url for i in assigned_indices if i in img_lookup]
                    image_descriptions = [
                        img_lookup[i].description for i in assigned_indices
                        if i in img_lookup and img_lookup[i].description
                    ]
                elif matching_chunk.image_urls:
                    # DOCX pre-assigned images
                    image_urls = matching_chunk.image_urls
                    image_descriptions = []
                else:
                    # Fallback: all images from this page (old behaviour)
                    page_imgs = image_map.get(page, [])
                    image_urls = [pi.url for pi in page_imgs]
                    image_descriptions = [pi.description for pi in page_imgs if pi.description]

                refined.append(
                    RefinedChunk(
                        text=item.get("text", ""),
                        page_number=page,
                        chapter=item.get("chapter", ""),
                        topic=item.get("topic", ""),
                        chunk_type=item.get("chunk_type", "explanation"),
                        image_urls=image_urls,
                        image_descriptions=image_descriptions,
                    )
                )

        except Exception as exc:
            logger.warning("Batch %d refinement failed: %s — using raw chunks", batch_start, exc)
            img_lookup = {idx: pi for idx, pi in batch_images}
            for c in batch:
                page_imgs = image_map.get(c.page_number, [])
                image_urls = c.image_urls or [pi.url for pi in page_imgs]
                image_descriptions = [pi.description for pi in page_imgs if pi.description]
                refined.append(
                    RefinedChunk(
                        text=c.text,
                        page_number=c.page_number,
                        chapter=c.chapter_hint,
                        topic=c.chapter_hint,
                        chunk_type="explanation",
                        image_urls=image_urls,
                        image_descriptions=image_descriptions,
                    )
                )

    return _postprocess(refined)
