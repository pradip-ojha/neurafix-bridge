"""
Structure-based PDF chunker using PyMuPDF.

Strategy:
  1. Extract text blocks with font-size metadata.
  2. Identify headings by font size (larger = heading).
  3. Group: heading block + all following paragraph/figure blocks = one RawChunk.
     Chunk boundaries are determined entirely by document structure (headings),
     NOT by character count. Semantic refinement (GPT-4o) decides whether a chunk
     should be split further or merged with a neighbour.
  4. Record image bounding boxes per page for later vision filtering + extraction.
"""

from __future__ import annotations

import asyncio
from typing import Any

import fitz  # PyMuPDF

from app.rag.schemas import RawChunk

_HEADING_RATIO = 1.15   # span is a heading if font_size >= median * this ratio
_MIN_CHUNK_CHARS = 60   # drop chunks shorter than this (page numbers, stray captions)


def _median_font_size(blocks: list[dict[str, Any]]) -> float:
    sizes: list[float] = []
    for b in blocks:
        for line in b.get("lines", []):
            for span in line.get("spans", []):
                if span.get("size"):
                    sizes.append(span["size"])
    if not sizes:
        return 12.0
    sizes.sort()
    return sizes[len(sizes) // 2]


def _block_max_font_size(block: dict[str, Any]) -> float:
    mx = 0.0
    for line in block.get("lines", []):
        for span in line.get("spans", []):
            if span.get("size", 0) > mx:
                mx = span["size"]
    return mx


def _block_text(block: dict[str, Any]) -> str:
    parts = []
    for line in block.get("lines", []):
        line_text = " ".join(span.get("text", "") for span in line.get("spans", []))
        parts.append(line_text.strip())
    return "\n".join(p for p in parts if p)


def chunk_pdf(pdf_bytes: bytes) -> tuple[list[RawChunk], dict[int, list[dict[str, Any]]]]:
    """
    Parse PDF bytes into structure-based RawChunks.

    One chunk per heading section. Size is determined by content, not a fixed limit.

    Returns:
        chunks:      list of RawChunk
        page_images: page_number (1-based) → list of {xref, bbox, index}
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_images: dict[int, list[dict[str, Any]]] = {}

    # Pass 1: compute median font size across entire document for heading detection
    all_blocks: list[dict[str, Any]] = []
    for page in doc:
        page_dict = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)
        for b in page_dict.get("blocks", []):
            if b.get("type") == 0:
                all_blocks.append(b)

    median_size = _median_font_size(all_blocks)
    heading_threshold = median_size * _HEADING_RATIO

    # Pass 2: collect image metadata per page
    for page in doc:
        pno = page.number + 1
        img_list = page.get_images(full=True)
        if img_list:
            page_images[pno] = [
                {"xref": img[0], "bbox": page.get_image_bbox(img[7] or img[0]), "index": idx}
                for idx, img in enumerate(img_list)
            ]

    # Pass 3: build heading-delimited chunks
    chunks: list[RawChunk] = []
    current_heading = ""
    current_texts: list[str] = []
    current_page = 1
    current_images: list[dict[str, Any]] = []

    def flush() -> None:
        nonlocal current_heading, current_texts, current_page, current_images
        combined = (current_heading + "\n" + "\n".join(current_texts)).strip()
        if len(combined) >= _MIN_CHUNK_CHARS:
            chunks.append(
                RawChunk(
                    text=combined,
                    page_number=current_page,
                    chapter_hint=current_heading,
                    image_blocks=current_images[:],
                )
            )
        current_texts = []
        current_images = []

    for page in doc:
        pno = page.number + 1
        page_dict = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)

        for b in page_dict.get("blocks", []):
            if b.get("type") == 1:  # image block inline in text flow
                current_images.append({"page": pno, "bbox": list(b.get("bbox", []))})
                continue
            if b.get("type") != 0:
                continue

            text = _block_text(b)
            if not text.strip():
                continue

            max_size = _block_max_font_size(b)
            is_heading = max_size >= heading_threshold and len(text) < 200

            if is_heading:
                flush()
                current_heading = text.strip()
                current_page = pno
            else:
                current_texts.append(text)
                if current_page == 1 and pno > 1:
                    current_page = pno

    flush()
    doc.close()
    return chunks, page_images


async def chunk_pdf_async(pdf_bytes: bytes) -> tuple[list[RawChunk], dict[int, list[dict[str, Any]]]]:
    return await asyncio.to_thread(chunk_pdf, pdf_bytes)
