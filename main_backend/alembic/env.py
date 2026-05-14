import asyncio
import os
import re
from logging.config import fileConfig

from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import pool, MetaData
from alembic import context

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Try full app settings (local dev + production containers).
# Falls back to DATABASE_URL only when settings are incomplete (CI migration runner).
try:
    from app.config import settings
    from app.database import Base
    import app.models  # noqa: F401 — registers all ORM models with Base.metadata
    _db_url = settings.async_database_url
    target_metadata = Base.metadata
except Exception:
    _db_url = os.environ["DATABASE_URL"]
    _db_url = _db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    _db_url = _db_url.replace("postgres://", "postgresql+asyncpg://", 1)
    _db_url = re.sub(r"[&?]channel_binding=[^&]*", "", _db_url)
    _db_url = _db_url.replace("sslmode=require", "ssl=require")
    _db_url = re.sub(r"\?$", "", _db_url)
    _db_url = re.sub(r"&$", "", _db_url)
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


def do_run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        version_table="alembic_version_main_backend",
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
