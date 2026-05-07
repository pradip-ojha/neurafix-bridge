# Import all models here so SQLAlchemy Base.metadata registers them.
# Required for Alembic autogenerate to detect all tables.
from app.models.rag_note import RagNote  # noqa: F401
from app.models.personalization import PersonalizationSummary, PlannerTimeline  # noqa: F401
from app.models.chat_session import ChatSession, ChatMessage  # noqa: F401
from app.models.mcq_question import MainQuestion, ExtraQuestion, ExtraSubject, QuestionFile  # noqa: F401
