"""
Extract images from PDF pages, filter with vision model, upload useful ones to R2.

R2 path pattern: books/{book_id}/page_{page}_{index}.png

Each image is assessed with full context (chapter, nearby text) so the vision
model can make an informed decision about relevance.

Three outcomes per image:
  - Educational diagram  → upload to R2, return as PageImage
  - Formula-only image   → extract formula text, discard image
  - Decorative/irrelevant → discard silently

Returns:
  image_map    : page_number → list[PageImage]   (only uploaded images)
  page_formulas: page_number → formula_text       (formula images only)
"""

from __future__ import annotations

import asyncio
import io
import logging
from typing import Any

import fitz
from PIL import Image

from app.r2_client import upload_bytes
from app.rag.image_filter import filter_image
from app.rag.schemas import PageImage, RawChunk

logger = logging.getLogger(__name__)

_MIN_IMAGE_SIZE = 60  # pixels — skip tiny icons below this threshold


def _render_png(doc: fitz.Document, xref: int) -> bytes | None:
    """Extract image from PDF xref, convert to PNG. Returns None if too small."""
    try:
        img_info = doc.extract_image(xref)
        raw = img_info["image"]
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        if img.width < _MIN_IMAGE_SIZE or img.height < _MIN_IMAGE_SIZE:
            return None
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue()
    except Exception:
        return None


async def extract_images_async(
    pdf_bytes: bytes,
    book_id: str,
    page_images: dict[int, list[dict[str, Any]]],
    page_context: dict[int, tuple[str, str]],  # page → (chapter_hint, text_snippet)
) -> tuple[dict[int, list[PageImage]], dict[int, str]]:
    """
    For each candidate image:
      1. Render to PNG bytes (in thread).
      2. Run vision filter with chapter/text context.
      3. Upload educational images to R2.
      4. Return formula text for formula-only images.

    Returns:
      image_map    : page_number → list[PageImage]
      page_formulas: page_number → formula_text
    """
    if not page_images:
        return {}, {}

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    candidates: list[tuple[int, int, str, bytes]] = []
    for page_number, img_infos in page_images.items():
        for info in img_infos:
            xref = info.get("xref")
            index = info.get("index", 0)
            if xref is None:
                continue
            png = _render_png(doc, xref)
            if png is None:
                continue
            r2_key = f"books/{book_id}/page_{page_number}_{index}.png"
            candidates.append((page_number, index, r2_key, png))

    doc.close()

    if not candidates:
        return {}, {}

    image_map: dict[int, list[PageImage]] = {}
    page_formulas: dict[int, str] = {}

    async def _process(page_number: int, index: int, r2_key: str, png_bytes: bytes) -> None:
        chapter, nearby_text = page_context.get(page_number, ("", ""))
        useful, description, topics, formula = await filter_image(
            png_bytes,
            chapter=chapter,
            topic="",
            nearby_text=nearby_text,
        )

        if formula:
            existing = page_formulas.get(page_number, "")
            page_formulas[page_number] = (existing + "\n" + formula).strip() if existing else formula
            logger.info("[extractor] Formula extracted page=%d: %s", page_number, formula)
            return

        if not useful:
            logger.info("[extractor] Discarded image page=%d idx=%d", page_number, index)
            return

        url = await asyncio.to_thread(upload_bytes, r2_key, png_bytes, "image/png")
        image_map.setdefault(page_number, []).append(
            PageImage(
                page_number=page_number,
                index=index,
                r2_key=r2_key,
                url=url,
                description=description,
                topics=topics,
            )
        )
        logger.info("[extractor] Uploaded image page=%d idx=%d → %s", page_number, index, url)

    await asyncio.gather(*[_process(*c) for c in candidates])
    return image_map, page_formulas
