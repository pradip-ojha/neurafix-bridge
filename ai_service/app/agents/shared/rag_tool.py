from agents import function_tool

from app.rag import retriever


def make_rag_tool(subject: str, chapter: str | None = None):
    """Return a function_tool that retrieves knowledge-base chunks for the given subject/chapter."""

    async def search_knowledge_base(query: str) -> str:
        """Search the educational knowledge base for this subject. Call this before answering any factual or concept question."""
        chunks = await retriever.retrieve(query, subject=subject, chapter=chapter)
        if not chunks:
            return "No relevant content found in the knowledge base for this query."
        parts = []
        for c in chunks:
            parts.append(
                f"Chapter: {c['chapter']}\nTopic: {c['topic']}\nSubtopic: {c.get('subtopic', '')}\n"
                f"Type: {c['chunk_type']}\nDifficulty: {c.get('difficulty', '')}\n"
                f"Content: {c['text']}"
            )
        return "\n---\n".join(parts)

    search_knowledge_base.__doc__ = (
        "Search the educational knowledge base for this subject. "
        "Call this before answering any factual or concept question."
    )
    return function_tool(search_knowledge_base)
