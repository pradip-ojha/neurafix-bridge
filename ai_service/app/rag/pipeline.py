"""
RAG pipeline orchestrator — text-only (.txt / .md).

Steps:
  1. chunking   — markdown-aware text splitter → list[RawChunk]
  2. refining   — configured fast Azure chat model assigns topic/subtopic/chunk_type/difficulty
  3. embedding  — configured Azure embedding model → Pinecone upsert

No R2 upload. Text is processed and discarded.
Progress is tracked in Redis and the RagNote DB row.
"""

from __future__ import annotations

import logging
from datetime import datetime, UTC

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.rag_note import RagNote, RagNoteStatus
from app.rag.chunker import chunk_text
from app.rag.embedder import embed_and_upsert
from app.rag.semantic_refiner import refine_chunks
from app.redis_client import set_json
from app.subject_structure.loader import get_chapter_structure

logger = logging.getLogger(__name__)

_REDIS_TTL = 86_400  # 24 hours


async def _update_progress(
    note_id: str,
    db: AsyncSession,
    *,
    status: str,
    stage: str,
    progress_pct: int,
    message: str,
) -> None:
    await set_json(
        f"rag:job:{note_id}",
        {"status": status, "stage": stage, "progress_pct": progress_pct, "message": message},
        ex=_REDIS_TTL,
    )
    result = await db.execute(select(RagNote).where(RagNote.note_id == note_id))
    note = result.scalar_one_or_none()
    if note:
        note.status = status
        await db.commit()


async def _mark_failed(note_id: str, db: AsyncSession, error: str) -> None:
    await set_json(
        f"rag:job:{note_id}",
        {"status": "failed", "stage": "error", "progress_pct": 0, "message": error},
        ex=_REDIS_TTL,
    )
    result = await db.execute(select(RagNote).where(RagNote.note_id == note_id))
    note = result.scalar_one_or_none()
    if note:
        note.status = RagNoteStatus.failed
        note.error_message = error[:1000]
        await db.commit()


async def run_pipeline(
    note_id: str,
    subject: str,
    chapter: str,
    file_content: str,
) -> None:
    """
    Full async pipeline. Runs as asyncio.create_task() — owns its own DB session.
    """
    async with AsyncSessionLocal() as db:
        try:
            # Stage 1: structure-based text chunking
            await _update_progress(
                note_id, db,
                status=RagNoteStatus.processing,
                stage="chunking",
                progress_pct=10,
                message="Splitting text into chunks...",
            )
            raw_chunks = chunk_text(file_content)
            logger.warning("[%s] Chunking: %d raw chunks", note_id, len(raw_chunks))

            if not raw_chunks:
                await _mark_failed(note_id, db, "File produced 0 chunks. Ensure the file has readable content.")
                return

            # Stage 2: LLM semantic refinement
            await _update_progress(
                note_id, db,
                status=RagNoteStatus.processing,
                stage="refining",
                progress_pct=30,
                message=f"Classifying {len(raw_chunks)} chunks with configured fast chat model...",
            )
            chapter_structure = await get_chapter_structure(subject, chapter)
            refined = await refine_chunks(
                raw_chunks,
                chapter_structure=chapter_structure,
                subject=subject,
                chapter=chapter,
            )
            logger.warning("[%s] Refinement: %d raw → %d refined", note_id, len(raw_chunks), len(refined))

            if not refined:
                await _mark_failed(note_id, db, "All chunks were empty after refinement.")
                return

            # Stage 3: embed + upsert to Pinecone
            await _update_progress(
                note_id, db,
                status=RagNoteStatus.processing,
                stage="embedding",
                progress_pct=60,
                message=f"Embedding {len(refined)} chunks → Pinecone...",
            )
            total_upserted = await embed_and_upsert(refined, note_id=note_id, subject=subject)
            logger.warning("[%s] Upserted %d vectors to Pinecone", note_id, total_upserted)

            # Mark complete
            await set_json(
                f"rag:job:{note_id}",
                {
                    "status": "completed",
                    "stage": "completed",
                    "progress_pct": 100,
                    "message": f"Done! {total_upserted} chunks indexed.",
                },
                ex=_REDIS_TTL,
            )
            result = await db.execute(select(RagNote).where(RagNote.note_id == note_id))
            note = result.scalar_one_or_none()
            if note:
                note.status = RagNoteStatus.completed
                note.total_chunks = total_upserted
                note.completed_at = datetime.now(UTC)
                await db.commit()

            logger.warning("[%s] Pipeline complete — %d vectors.", note_id, total_upserted)

        except Exception as exc:
            logger.exception("[%s] Pipeline failed: %s", note_id, exc)
            await _mark_failed(note_id, db, str(exc))
