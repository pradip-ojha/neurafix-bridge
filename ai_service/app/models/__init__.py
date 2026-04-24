# Import all models here so SQLAlchemy Base.metadata registers them.
# This is required for Alembic autogenerate to detect all tables.
from app.models.rag_job import RagJob  # noqa: F401
