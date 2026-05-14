import os
import re
from logging.config import fileConfig

from sqlalchemy import create_engine, pool, MetaData
from alembic import context

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _make_sync_url(url: str) -> str:
    """Convert any postgres URL to a psycopg2 sync URL for migrations."""
    url = url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
    url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    url = url.replace("postgres://", "postgresql+psycopg2://", 1)
    # psycopg2 does not support channel_binding — strip it
    url = re.sub(r"[&?]channel_binding=[^&]*", "", url)
    # psycopg2 uses sslmode=require natively — no conversion needed
    # Clean up any trailing ? or dangling &
    url = re.sub(r"\?$", "", url)
    url = re.sub(r"&$", "", url)
    return url


# Try full app settings (local dev + production containers).
# Falls back to DATABASE_URL only when settings are incomplete (CI migration runner).
try:
    from app.config import settings
    from app.database import Base
    import app.models  # noqa: F401 — registers all ORM models with Base.metadata
    _db_url = _make_sync_url(settings.DATABASE_URL)
    target_metadata = Base.metadata
except Exception:
    _db_url = _make_sync_url(os.environ["DATABASE_URL"])
    target_metadata = MetaData()

config.set_main_option("sqlalchemy.url", _db_url.replace("%", "%%"))


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table="alembic_version_main_backend",
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(
        config.get_main_option("sqlalchemy.url"),
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            version_table="alembic_version_main_backend",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
