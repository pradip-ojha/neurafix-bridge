import asyncio
import hashlib
import logging

from openai import AsyncOpenAI

from app.config import settings
from app.pinecone_client import get_index
from app import redis_client

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None
_EMBED_MODEL = "text-embedding-3-large"
_EMBED_DIM = 3072
_EMBED_TIMEOUT = 8.0
_PINECONE_TIMEOUT = 5.0
_CACHE_TTL = 600  # 10 min


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


def _cache_key(query: str, subject: str, chapter: str | None, topic: str | None) -> str:
    raw = f"{query}|{subject}|{chapter}|{topic}"
    return "pinecone:" + hashlib.sha256(raw.encode()).hexdigest()[:32]


async def retrieve(
    query: str,
    subject: str,
    chapter: str | None = None,
    topic: str | None = None,
    top_k: int = 5,
) -> list[dict]:
    """Embed query and retrieve top-k relevant chunks from Pinecone.

    Returns empty list (with logged warning) on timeout or error so callers
    can degrade gracefully instead of propagating exceptions.
    """
    key = _cache_key(query, subject, chapter, topic)
    try:
        cached = await redis_client.get_json(key)
        if cached is not None:
            logger.debug("Pinecone cache hit for subject=%s chapter=%s", subject, chapter)
            return cached
    except Exception:
        pass  # Redis unavailable — proceed to live query

    client = _get_client()

    try:
        response = await asyncio.wait_for(
            client.embeddings.create(
                model=_EMBED_MODEL,
                input=[query],
                dimensions=_EMBED_DIM,
            ),
            timeout=_EMBED_TIMEOUT,
        )
        query_vector = response.data[0].embedding
    except asyncio.TimeoutError:
        logger.warning("Embedding API timed out for subject=%s query=%r", subject, query[:60])
        return []
    except Exception as exc:
        logger.warning("Embedding API error for subject=%s: %s", subject, exc)
        return []

    index = get_index()
    pinecone_filter: dict = {"subject": {"$eq": subject}}
    if chapter:
        pinecone_filter["chapter"] = {"$eq": chapter}
    if topic:
        pinecone_filter["topic"] = {"$eq": topic}

    try:
        loop = asyncio.get_event_loop()
        results = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: index.query(
                    vector=query_vector,
                    top_k=top_k,
                    filter=pinecone_filter,
                    include_metadata=True,
                ),
            ),
            timeout=_PINECONE_TIMEOUT,
        )
    except asyncio.TimeoutError:
        logger.warning("Pinecone query timed out for subject=%s chapter=%s", subject, chapter)
        return []
    except Exception as exc:
        logger.warning("Pinecone query error for subject=%s: %s", subject, exc)
        return []

    matches = results.get("matches", [])
    logger.debug(
        "Pinecone returned %d matches for subject=%s chapter=%s topic=%s query=%r",
        len(matches), subject, chapter, topic, query[:80],
    )

    chunks = []
    for m in matches:
        meta = m.get("metadata", {})
        chunks.append({
            "text": meta.get("text", ""),
            "chapter": meta.get("chapter", ""),
            "topic": meta.get("topic", ""),
            "subtopic": meta.get("subtopic", ""),
            "chunk_type": meta.get("chunk_type", ""),
            "difficulty": meta.get("difficulty", ""),
            "score": m.get("score", 0.0),
        })

    if chunks:
        try:
            await redis_client.set_json(key, chunks, ex=_CACHE_TTL)
        except Exception:
            pass

    return chunks
