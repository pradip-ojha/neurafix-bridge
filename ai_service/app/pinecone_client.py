from pinecone import Pinecone, ServerlessSpec

from app.config import settings

_pc: Pinecone | None = None
_index = None
INDEX_NAME = "hamroguru"


def get_pinecone() -> Pinecone:
    global _pc
    if _pc is None:
        _pc = Pinecone(api_key=settings.PINECONE_API_KEY)
    return _pc


def get_index():
    """Return the hamroguru Pinecone index. Creates it if needed. Cached after first call."""
    global _index
    if _index is None:
        pc = get_pinecone()
        existing = [i.name for i in pc.list_indexes()]
        if INDEX_NAME not in existing:
            pc.create_index(
                name=INDEX_NAME,
                dimension=3072,
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-east-1"),
            )
        _index = pc.Index(INDEX_NAME)
    return _index


def check_connection() -> bool:
    """Verify Pinecone connection by listing indexes."""
    try:
        pc = get_pinecone()
        pc.list_indexes()
        return True
    except Exception:
        return False
