"""
Embed refined chunks with text-embedding-3-large and upsert to Pinecone.

Pinecone metadata per vector:
  note_id, subject, chapter, topic, subtopic, chunk_type, text
"""

from __future__ import annotations

import logging
import uuid

from openai import AsyncOpenAI

from app.config import settings
from app.pinecone_client import get_index
from app.rag.schemas import RefinedChunk

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None

_EMBED_MODEL = "text-embedding-3-large"
_EMBED_DIM = 3072
_UPSERT_BATCH = 100
_EMBED_BATCH = 50


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


async def embed_and_upsert(
    chunks: list[RefinedChunk],
    note_id: str,
    subject: str,
) -> int:
    """Embed all chunks and upsert to Pinecone. Returns total vectors upserted."""
    if not chunks:
        return 0

    client = _get_client()
    index = get_index()
    total_upserted = 0

    all_embeddings: list[list[float]] = []
    for i in range(0, len(chunks), _EMBED_BATCH):
        batch = chunks[i : i + _EMBED_BATCH]
        texts = [c.text for c in batch]
        try:
            response = await client.embeddings.create(
                model=_EMBED_MODEL,
                input=texts,
                dimensions=_EMBED_DIM,
            )
            all_embeddings.extend([e.embedding for e in response.data])
        except Exception as exc:
            logger.error("Embedding batch %d failed: %s", i, exc)
            all_embeddings.extend([[0.0] * _EMBED_DIM for _ in batch])

    vectors = []
    for chunk, embedding in zip(chunks, all_embeddings):
        metadata = {
            "note_id": note_id,
            "subject": subject,
            "chapter": chunk.chapter,
            "topic": chunk.topic,
            "subtopic": chunk.subtopic,
            "chunk_type": chunk.chunk_type,
            "text": chunk.text[:2000],
        }
        vectors.append({"id": str(uuid.uuid4()), "values": embedding, "metadata": metadata})

    for i in range(0, len(vectors), _UPSERT_BATCH):
        batch = vectors[i : i + _UPSERT_BATCH]
        try:
            index.upsert(vectors=batch)
            total_upserted += len(batch)
        except Exception as exc:
            logger.error("Pinecone upsert batch %d failed: %s", i, exc)

    return total_upserted


async def delete_note_vectors(note_id: str) -> None:
    """Delete all Pinecone vectors for a given note_id."""
    index = get_index()
    try:
        index.delete(filter={"note_id": {"$eq": note_id}})
    except Exception as exc:
        logger.error("Failed to delete vectors for note_id=%s: %s", note_id, exc)
        raise
