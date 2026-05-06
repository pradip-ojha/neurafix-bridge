"""
Markdown-aware text chunker for .txt/.md RAG notes.

Strategy:
  1. Parse markdown headers to extract the chapter/topic/subtopic hierarchy.
       # heading  → chapter title (resets context, not emitted as chunk)
       ## heading → topic (current_topic_hint)
       ### heading → subtopic (current_subtopic_hint)
       ####+ heading → treated as body content
  2. Accumulate body lines between structural headers.
  3. Flush accumulated content as a RawChunk whenever a new structural header
     is encountered or the file ends.
  4. Each chunk carries topic_hint and subtopic_hint so the refiner can map
     them to topic IDs deterministically — no LLM guesswork needed.
  5. Falls back to paragraph splitting for plain-text files with no headers.
"""

from __future__ import annotations

import re

from app.rag.schemas import RawChunk

_MIN_CHUNK_CHARS = 80
_MAX_PARAGRAPH_MERGE_CHARS = 600
_HEADER_RE = re.compile(r'^(#{1,6})\s+(.+)$')


def chunk_text(content: str) -> list[RawChunk]:
    lines = content.splitlines()

    # Check if file has any markdown headers at all
    has_headers = any(_HEADER_RE.match(line) for line in lines)
    if not has_headers:
        return _chunk_by_paragraphs(content)

    chunks: list[RawChunk] = []
    current_topic_hint: str = ""
    current_subtopic_hint: str = ""
    current_header_hint: str = ""
    accumulated: list[str] = []

    def flush() -> None:
        text = "\n".join(accumulated).strip()
        if len(text) >= _MIN_CHUNK_CHARS:
            chunks.append(RawChunk(
                text=text,
                header_hint=current_header_hint,
                topic_hint=current_topic_hint,
                subtopic_hint=current_subtopic_hint,
            ))
        accumulated.clear()

    for line in lines:
        m = _HEADER_RE.match(line)
        if not m:
            accumulated.append(line)
            continue

        level = len(m.group(1))
        heading = m.group(2).strip()

        if level == 1:
            # Chapter title — flush any preamble, reset all context
            flush()
            current_topic_hint = ""
            current_subtopic_hint = ""
            current_header_hint = heading
            # Don't start accumulating the # line itself

        elif level == 2:
            # Topic heading — flush previous section, start new one
            flush()
            current_topic_hint = heading
            current_subtopic_hint = ""
            current_header_hint = heading
            accumulated.append(line)  # include ## heading in chunk text

        elif level == 3:
            # Subtopic heading — flush previous section, start new one
            flush()
            current_subtopic_hint = heading
            current_header_hint = heading
            # topic_hint carries over from the enclosing ## section
            accumulated.append(line)  # include ### heading in chunk text

        else:
            # level 4+ treated as body content
            accumulated.append(line)

    flush()  # flush the final section

    return chunks if chunks else _chunk_by_paragraphs(content)


def _chunk_by_paragraphs(content: str) -> list[RawChunk]:
    """Fallback: group double-newline-separated paragraphs into chunks."""
    paragraphs = [p.strip() for p in content.split('\n\n') if p.strip()]
    chunks: list[RawChunk] = []
    current = ""

    for para in paragraphs:
        candidate = (current + "\n\n" + para).strip() if current else para
        if len(current) >= _MIN_CHUNK_CHARS and len(candidate) > _MAX_PARAGRAPH_MERGE_CHARS:
            chunks.append(RawChunk(text=current))
            current = para
        else:
            current = candidate

    if current and len(current) >= _MIN_CHUNK_CHARS:
        chunks.append(RawChunk(text=current))

    return chunks
