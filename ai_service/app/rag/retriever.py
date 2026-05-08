import logging

from openai import AsyncOpenAI

from app.config import settings
from app.pinecone_client import get_index

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None
_EMBED_MODEL = "text-embedding-3-large"
_EMBED_DIM = 3072


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


async def retrieve(
    query: str,
    subject: str,
    chapter: str | None = None,
    topic: str | None = None,
    top_k: int = 5,
) -> list[dict]:
    """Embed query and retrieve top-k relevant chunks from Pinecone."""
    client = _get_client()

    response = await client.embeddings.create(
        model=_EMBED_MODEL,
        input=[query],
        dimensions=_EMBED_DIM,
    )
    query_vector = response.data[0].embedding

    index = get_index()
    pinecone_filter: dict = {"subject": {"$eq": subject}}
    if chapter:
        pinecone_filter["chapter"] = {"$eq": chapter}
    if topic:
        pinecone_filter["topic"] = {"$eq": topic}

    results = index.query(
        vector=query_vector,
        top_k=top_k,
        filter=pinecone_filter,
        include_metadata=True,
    )

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
    return chunks
