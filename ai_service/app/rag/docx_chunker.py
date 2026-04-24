"""
Word document (.docx) chunker — primary pipeline, equal to PDF.

Strategy:
  1. Iterate document body in document order (paragraphs + tables together).
  2. Heading-styled paragraphs trigger a new chunk.
  3. Body text and tables accumulate inside the current chunk.
  4. Chunk size is determined by content structure, not a fixed character limit.
     GPT-4o semantic refinement decides further splits/merges.
  5. Inline images are collected with their context (chapter, nearby text)
     as PendingImage objects — NOT uploaded during this sync phase.
  6. A separate async pass (filter_and_upload_docx_images) runs the vision
     filter with full context and uploads only educational images.
"""

from __future__ import annotations

import asyncio
import io
import logging
import uuid
from dataclasses import dataclass
from typing import Iterator

from docx import Document
from docx.document import Document as DocType
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table, _Cell
from docx.text.paragraph import Paragraph

from app.r2_client import upload_bytes
from app.rag.image_filter import filter_image
from app.rag.schemas import PageImage, RawChunk

logger = logging.getLogger(__name__)

_MIN_CHUNK_CHARS = 60
_HEADING_STYLE_PREFIXES = ("heading", "title")

# Minimum image dimensions for DOCX images.
# OCR artifacts (text fragments, partial sentences rendered as images) are
# typically short lines — wide but very short in height.
# Discard if height < 80px OR (height < 200px AND aspect_ratio > 6).
_DOCX_MIN_HEIGHT = 80
_DOCX_NARROW_HEIGHT = 200
_DOCX_NARROW_RATIO = 6

_IMG_EXT = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
}


@dataclass
class PendingImage:
    """Raw image bytes ready for async vision filter + R2 upload."""
    chunk_index: int        # which chunk this image belongs to
    img_index: int
    image_bytes: bytes
    content_type: str
    book_id: str
    chapter_hint: str       # heading of the section the image is in
    nearby_text: str        # text accumulated so far in the same section


# ── Document iteration ────────────────────────────────────────────────────────

def _iter_block_items(parent: DocType | _Cell) -> Iterator[Paragraph | Table]:
    elm = parent.element.body if isinstance(parent, DocType) else parent._tc
    for child in elm.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)


# ── Table → text ──────────────────────────────────────────────────────────────

def _table_to_text(table: Table) -> str:
    rows = []
    for row in table.rows:
        cells = [cell.text.strip() for cell in row.cells]
        seen: set[str] = set()
        unique: list[str] = []
        for c in cells:
            if c not in seen:
                unique.append(c)
                seen.add(c)
        rows.append(" | ".join(unique))
    return "\n".join(r for r in rows if r.strip())


# ── Image collection (no upload) ─────────────────────────────────────────────

def _collect_images_from_paragraph(
    para: Paragraph,
    doc: DocType,
    chunk_index: int,
    img_counter: list[int],
    book_id: str,
    chapter_hint: str,
    nearby_text: str,
) -> list[PendingImage]:
    ns_a = "http://schemas.openxmlformats.org/drawingml/2006/main"
    ns_r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    pending: list[PendingImage] = []
    for blip in para._p.iter(f"{{{ns_a}}}blip"):
        rid = blip.get(f"{{{ns_r}}}embed")
        if not rid:
            continue
        try:
            rel = doc.part.rels.get(rid)
            if rel is None:
                continue
            image_part = rel.target_part
            pending.append(
                PendingImage(
                    chunk_index=chunk_index,
                    img_index=img_counter[0],
                    image_bytes=image_part.blob,
                    content_type=image_part.content_type,
                    book_id=book_id,
                    chapter_hint=chapter_hint,
                    nearby_text=nearby_text[:500],
                )
            )
            img_counter[0] += 1
        except Exception as exc:
            logger.warning("[docx] Failed to collect image rid=%s: %s", rid, exc)
    return pending


# ── Main chunker (sync) ───────────────────────────────────────────────────────

def chunk_docx(
    docx_bytes: bytes,
    book_id: str,
) -> tuple[list[RawChunk], list[PendingImage]]:
    """
    Parse a .docx file into heading-delimited RawChunks.
    Images are collected as PendingImage (bytes only, no upload) with chapter/text context.

    Returns:
        chunks:         list[RawChunk] — no image_urls yet
        pending_images: list[PendingImage] — awaiting async filter + upload
    """
    doc = Document(io.BytesIO(docx_bytes))
    chunks: list[RawChunk] = []
    pending_images: list[PendingImage] = []
    img_counter = [0]

    current_heading = ""
    current_texts: list[str] = []
    chunk_index = 0

    def flush() -> None:
        nonlocal chunk_index
        combined = (current_heading + "\n" + "\n".join(current_texts)).strip()
        if len(combined) >= _MIN_CHUNK_CHARS:
            chunks.append(
                RawChunk(
                    text=combined,
                    page_number=chunk_index + 1,  # synthetic; docx has no page numbers
                    chapter_hint=current_heading,
                )
            )
            chunk_index += 1

    for block in _iter_block_items(doc):
        if isinstance(block, Table):
            table_text = _table_to_text(block)
            if table_text.strip():
                current_texts.append(table_text)
            continue

        para: Paragraph = block
        style_lower = (para.style.name or "").lower()
        text = para.text.strip()

        # Collect images with current section context so vision filter has context
        imgs = _collect_images_from_paragraph(
            para, doc, chunk_index, img_counter, book_id,
            chapter_hint=current_heading,
            nearby_text="\n".join(current_texts),
        )
        pending_images.extend(imgs)

        is_heading = any(style_lower.startswith(p) for p in _HEADING_STYLE_PREFIXES)

        if is_heading and text:
            flush()
            current_heading = text
            current_texts = []
        elif text:
            current_texts.append(text)

    flush()

    logger.warning(
        "[docx] Chunking done: %d chunks, %d pending images for book_id=%s",
        len(chunks), len(pending_images), book_id,
    )
    return chunks, pending_images


async def chunk_docx_async(
    docx_bytes: bytes,
    book_id: str,
) -> tuple[list[RawChunk], list[PendingImage]]:
    return await asyncio.to_thread(chunk_docx, docx_bytes, book_id)


# ── Async vision filter + upload ──────────────────────────────────────────────

async def filter_and_upload_docx_images(
    pending_images: list[PendingImage],
    chunks: list[RawChunk],
) -> tuple[dict[int, list[PageImage]], dict[int, str]]:
    """
    Filter pending images with gpt-4o-mini vision using chapter/text context,
    upload educational images to R2, extract formulas from formula-only images.

    Returns:
        chunk_image_map : chunk_index → list[PageImage]
        chunk_formulas  : chunk_index → formula_text  (for formula images only)
    """
    if not pending_images:
        return {}, {}

    chunk_image_map: dict[int, list[PageImage]] = {}
    chunk_formulas: dict[int, str] = {}

    async def _process(pi: PendingImage) -> None:
        from PIL import Image
        import io as _io

        # Normalize to PNG and check dimensions before vision filter
        try:
            img = Image.open(_io.BytesIO(pi.image_bytes)).convert("RGB")
            w, h = img.width, img.height
            aspect = w / h if h > 0 else 999

            # Discard OCR artifacts: very short images or narrow text-line images
            if h < _DOCX_MIN_HEIGHT or (h < _DOCX_NARROW_HEIGHT and aspect > _DOCX_NARROW_RATIO):
                logger.info(
                    "[docx_filter] Discarded OCR artifact chunk=%d (size=%dx%d ratio=%.1f)",
                    pi.chunk_index, w, h, aspect,
                )
                return

            buf = _io.BytesIO()
            img.save(buf, format="PNG", optimize=True)
            png_bytes = buf.getvalue()
        except Exception:
            png_bytes = pi.image_bytes

        # Use chapter hint and nearby text for context
        useful, description, topics, formula = await filter_image(
            png_bytes,
            chapter=pi.chapter_hint,
            topic="",
            nearby_text=pi.nearby_text,
        )

        if formula:
            existing = chunk_formulas.get(pi.chunk_index, "")
            chunk_formulas[pi.chunk_index] = (
                (existing + "\n" + formula).strip() if existing else formula
            )
            logger.info("[docx_filter] Formula extracted chunk=%d: %s", pi.chunk_index, formula)
            return

        if not useful:
            logger.info("[docx_filter] Discarded image chunk=%d img=%d", pi.chunk_index, pi.img_index)
            return

        ext = _IMG_EXT.get(pi.content_type, "png")
        r2_key = f"books/{pi.book_id}/img_{pi.img_index}_{uuid.uuid4().hex[:8]}.{ext}"
        url = await asyncio.to_thread(upload_bytes, r2_key, pi.image_bytes, pi.content_type)

        chunk_image_map.setdefault(pi.chunk_index, []).append(
            PageImage(
                page_number=pi.chunk_index + 1,
                index=pi.img_index,
                r2_key=r2_key,
                url=url,
                description=description,
                topics=topics,
            )
        )
        logger.info("[docx_filter] Uploaded image chunk=%d → %s", pi.chunk_index, url)

    await asyncio.gather(*[_process(pi) for pi in pending_images])
    return chunk_image_map, chunk_formulas
