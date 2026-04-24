"""
RAG pipeline orchestrator.

Both PDF and DOCX are first-class pipelines with identical quality.

PDF pipeline:
  1. chunking          — PyMuPDF, heading-delimited, content-driven size
  2. extracting_images — vision filter with chapter+text context → R2 upload
                         formula images → text appended to chunk, image discarded
  3. refining          — GPT-4o semantic refinement (merge/split by concept)
  4. embedding         — text-embedding-3-large → Pinecone upsert

DOCX pipeline:
  1. docx_chunking     — python-docx, heading-delimited, content-driven size
                         images collected as raw bytes with context (not uploaded yet)
  2. extracting_images — same vision filter with chapter+text context → R2 upload
                         formula images → text appended to chunk, image discarded
  3. refining          — same GPT-4o semantic refinement
  4. embedding         — same embedding + Pinecone upsert

Progress tracked in Redis (rag:job:{job_id}) and the RagJob DB row.
"""

from __future__ import annotations

import logging
from datetime import datetime, UTC

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.rag_job import RagJob, RagJobStatus
from app.rag.chunker import chunk_pdf_async
from app.rag.docx_chunker import chunk_docx_async, filter_and_upload_docx_images
from app.rag.embedder import embed_and_upsert
from app.rag.image_extractor import extract_images_async
from app.rag.schemas import BookUploadRequest, PageImage, RawChunk, RefinedChunk
from app.rag.semantic_refiner import refine_chunks
from app.redis_client import set_json

logger = logging.getLogger(__name__)

_REDIS_TTL = 86_400  # 24 hours


async def _update_progress(
    job_id: str,
    db: AsyncSession,
    *,
    status: str,
    stage: str,
    progress_pct: int,
    message: str,
) -> None:
    await set_json(
        f"rag:job:{job_id}",
        {"status": status, "stage": stage, "progress_pct": progress_pct, "message": message},
        ex=_REDIS_TTL,
    )
    job = await db.get(RagJob, job_id)
    if job:
        job.status = status
        await db.commit()


async def _mark_failed(job_id: str, db: AsyncSession, error: str) -> None:
    await set_json(
        f"rag:job:{job_id}",
        {"status": "failed", "stage": "error", "progress_pct": 0, "message": error},
        ex=_REDIS_TTL,
    )
    job = await db.get(RagJob, job_id)
    if job:
        job.status = RagJobStatus.failed
        job.error_message = error[:1000]
        await db.commit()


def _attach_formulas_to_chunks(
    chunks: list[RawChunk],
    formulas: dict[int, str],
    key: str = "page_number",
) -> None:
    """
    Append extracted formula text to the matching chunk's text.
    key="page_number" for PDF (keyed by page), key="chunk_index" for DOCX (keyed by index).
    """
    for i, chunk in enumerate(chunks):
        lookup = chunk.page_number if key == "page_number" else i
        formula = formulas.get(lookup, "")
        if formula:
            chunk.text = chunk.text + f"\n\nMentioned formula: {formula}"


def _ensure_all_images_assigned(
    refined_chunks: list[RefinedChunk],
    image_map: dict[int, list[PageImage]],
) -> None:
    """
    Guarantee every R2-uploaded image is referenced by at least one chunk.

    GPT-4o assigns images during batch refinement, but when chunks are merged
    across pages the resulting chunk carries only the first page's number, so
    images from the second page are missed by the page-based fallback lookup.
    This pass catches those orphans after all batches are complete.
    """
    if not refined_chunks or not image_map:
        return

    referenced: set[str] = {url for chunk in refined_chunks for url in chunk.image_urls}

    for page_number, page_imgs in image_map.items():
        for img in page_imgs:
            if img.url in referenced:
                continue
            best = min(refined_chunks, key=lambda c: abs(c.page_number - page_number))
            best.image_urls.append(img.url)
            if img.description:
                best.image_descriptions.append(img.description)
            referenced.add(img.url)
            logger.warning(
                "[pipeline] Orphan image page=%d → assigned to chunk page=%d topic=%r",
                page_number, best.page_number, best.topic,
            )


async def run_pipeline(
    job_id: str,
    file_bytes: bytes,
    file_ext: str,          # "pdf" or "docx"
    request: BookUploadRequest,
) -> None:
    """
    Full async pipeline. Runs as asyncio.create_task() — owns its own DB session.
    """
    async with AsyncSessionLocal() as db:
        try:
            raw_chunks: list[RawChunk]
            image_map: dict[int, list[PageImage]]

            # ═══════════════════════════════════════════════════════════════
            #  DOCX PIPELINE
            # ═══════════════════════════════════════════════════════════════
            if file_ext == "docx":

                # Stage 1: heading-delimited chunking + image byte collection
                await _update_progress(
                    job_id, db,
                    status=RagJobStatus.processing,
                    stage="docx_chunking",
                    progress_pct=5,
                    message="Parsing Word document — structuring text and collecting images...",
                )
                raw_chunks, pending_images = await chunk_docx_async(file_bytes, request.book_id)
                logger.warning("[%s] DOCX: %d chunks, %d pending images",
                               job_id, len(raw_chunks), len(pending_images))

                if not raw_chunks:
                    await _mark_failed(
                        job_id, db,
                        "Word document produced 0 chunks. Ensure the document uses Word heading "
                        "styles (Heading 1, Heading 2, etc.) so the structure can be detected."
                    )
                    return

                # Stage 2: vision filter → upload educational images, extract formulas
                await _update_progress(
                    job_id, db,
                    status=RagJobStatus.processing,
                    stage="extracting_images",
                    progress_pct=20,
                    message=f"Filtering {len(pending_images)} images with vision model...",
                )
                chunk_image_map, chunk_formulas = await filter_and_upload_docx_images(
                    pending_images, raw_chunks
                )
                useful_count = sum(len(v) for v in chunk_image_map.values())
                formula_count = len(chunk_formulas)
                logger.warning(
                    "[%s] DOCX images: %d/%d kept, %d formulas extracted",
                    job_id, useful_count, len(pending_images), formula_count,
                )

                # Attach formula text to chunks before refinement
                _attach_formulas_to_chunks(raw_chunks, chunk_formulas, key="chunk_index")

                # Attach image URLs to the chunks they belong to
                for chunk_idx, page_imgs in chunk_image_map.items():
                    if chunk_idx < len(raw_chunks):
                        raw_chunks[chunk_idx].image_urls = [pi.url for pi in page_imgs]

                # Convert to page_number-keyed map for the refiner
                image_map = {}
                for chunk_idx, page_imgs in chunk_image_map.items():
                    if chunk_idx < len(raw_chunks):
                        pno = raw_chunks[chunk_idx].page_number
                        image_map.setdefault(pno, []).extend(page_imgs)

            # ═══════════════════════════════════════════════════════════════
            #  PDF PIPELINE
            # ═══════════════════════════════════════════════════════════════
            else:

                # Stage 1: heading-delimited text chunking
                await _update_progress(
                    job_id, db,
                    status=RagJobStatus.processing,
                    stage="chunking",
                    progress_pct=5,
                    message="Extracting and structuring text from PDF...",
                )
                raw_chunks, page_images = await chunk_pdf_async(file_bytes)
                logger.warning(
                    "[%s] PDF: %d chunks, %d pages with images",
                    job_id, len(raw_chunks), len(page_images),
                )

                if not raw_chunks:
                    await _mark_failed(
                        job_id, db,
                        "PDF produced 0 text chunks — likely a scanned/image-only PDF. "
                        "Convert to Word (.docx) first, then re-upload."
                    )
                    return

                # Build page → (chapter_hint, text_snippet) context for vision filter
                page_context: dict[int, tuple[str, str]] = {}
                for chunk in raw_chunks:
                    if chunk.page_number not in page_context:
                        page_context[chunk.page_number] = (
                            chunk.chapter_hint,
                            chunk.text[:500],
                        )

                # Stage 2: vision filter → upload educational images, extract formulas
                total_candidates = sum(len(v) for v in page_images.values())
                await _update_progress(
                    job_id, db,
                    status=RagJobStatus.processing,
                    stage="extracting_images",
                    progress_pct=20,
                    message=f"Filtering {total_candidates} images with vision model...",
                )
                image_map, page_formulas = await extract_images_async(
                    file_bytes, request.book_id, page_images, page_context
                )
                useful_count = sum(len(v) for v in image_map.values())
                formula_count = len(page_formulas)
                logger.warning(
                    "[%s] PDF images: %d/%d kept, %d formula pages",
                    job_id, useful_count, total_candidates, formula_count,
                )

                # Attach formula text to chunks whose page had formula images
                _attach_formulas_to_chunks(raw_chunks, page_formulas, key="page_number")

            # ═══════════════════════════════════════════════════════════════
            #  SHARED: Refine → Embed → Upsert
            # ═══════════════════════════════════════════════════════════════

            # Stage 3: semantic refinement
            await _update_progress(
                job_id, db,
                status=RagJobStatus.processing,
                stage="refining",
                progress_pct=35,
                message=f"Refining {len(raw_chunks)} chunks with GPT-4o...",
            )
            refined_chunks = await refine_chunks(
                raw_chunks,
                image_map,
                subject=request.subject,
                book_title=request.book_title,
            )
            logger.warning(
                "[%s] Refinement: %d raw → %d refined",
                job_id, len(raw_chunks), len(refined_chunks),
            )

            # Safety net: every R2 image must appear in at least one chunk
            _ensure_all_images_assigned(refined_chunks, image_map)

            if not refined_chunks:
                await _mark_failed(
                    job_id, db,
                    f"GPT-4o discarded all {len(raw_chunks)} chunks during refinement. "
                    "Check server logs for details."
                )
                return

            # Stage 4: embed + upsert
            await _update_progress(
                job_id, db,
                status=RagJobStatus.processing,
                stage="embedding",
                progress_pct=65,
                message=f"Embedding {len(refined_chunks)} chunks → Pinecone...",
            )
            total_upserted = await embed_and_upsert(
                refined_chunks,
                book_id=request.book_id,
                book_title=request.book_title,
                subject=request.subject,
                stream=request.stream,
                book_type=request.book_type,
                publisher=request.publisher,
                class_level=request.class_level,
            )
            logger.warning("[%s] Upserted %d vectors to Pinecone", job_id, total_upserted)

            # Complete
            await set_json(
                f"rag:job:{job_id}",
                {
                    "status": "completed",
                    "stage": "completed",
                    "progress_pct": 100,
                    "message": f"Done! {total_upserted} chunks indexed.",
                },
                ex=_REDIS_TTL,
            )
            job = await db.get(RagJob, job_id)
            if job:
                job.status = RagJobStatus.completed
                job.total_chunks = total_upserted
                job.completed_at = datetime.now(UTC)
                await db.commit()

            logger.warning("[%s] Pipeline complete — %d vectors.", job_id, total_upserted)

        except Exception as exc:
            logger.exception("[%s] Pipeline failed: %s", job_id, exc)
            await _mark_failed(job_id, db, str(exc))
