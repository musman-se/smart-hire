"""Alembic environment.

Three things differ from the generated template:

1. The database URL comes from app settings, not from alembic.ini. One source of truth,
   so migrations cannot run against a different database than the app. Code that runs
   Alembic programmatically — tests/test_migrations.py — may pass its own URL in
   `config.attributes["database_url"]` to target a scratch database instead.
2. target_metadata is app Base.metadata, which is what makes `--autogenerate` able to
   diff the models against the live schema.
3. Logging is configured from alembic.ini only when Alembic runs from the command line.
   fileConfig() disables every logger that already exists, which would silence the
   application's loggers for the rest of a test run.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import settings

# Importing the model registry puts every table on Base.metadata. Without this
# import autogenerate sees an empty metadata and proposes dropping everything.
from app.models import Base

config = context.config
database_url = config.attributes.get("database_url", settings.database_url)
config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))

if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Emit SQL to stdout instead of running it — useful for review before production."""
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        # Detect column type changes as well as added/removed columns.
        compare_type=True,
        compare_server_default=True,
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
