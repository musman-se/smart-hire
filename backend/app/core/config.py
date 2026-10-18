"""Application settings — every tunable value, read from environment variables.

Pydantic reads each field from an environment variable of the same name
(case-insensitive): `db_pool_size` is set by `DB_POOL_SIZE`. The `.env` files listed in
model_config are read too, for local development; real environment variables win over
them.
Values are validated at startup, so `DB_POOL_SIZE=lots` stops the process immediately
instead of failing on the first query.

The rule this file exists to enforce: **no other module reads os.environ, and no other
module hard-codes a value that differs between environments.** Hosts, ports,
credentials, pool sizes and business limits all come from here.

Every variable is listed, with its default, in `.env.example` at the repository root.
"""

from functools import cached_property
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # The repository root's .env (one file for Compose and the backend alike), then
        # backend/.env for personal overrides. Later files win; real environment
        # variables win over both. Missing files are skipped.
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Application ---------------------------------------------------------------
    app_name: str = "SmartHire API"
    environment: Literal["local", "docker", "test", "production"] = "local"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    # --- Database ------------------------------------------------------------------
    # The connection is described by its parts, so Docker Compose can hand the same
    # POSTGRES_* variables to the database container and to the API, overriding only
    # POSTGRES_HOST. Inside Compose the host is the service name "db"; on your machine
    # it is "localhost".
    postgres_host: str = "localhost"
    postgres_port: int = Field(default=5432, ge=1, le=65535)
    postgres_user: str = "smarthire"
    postgres_password: SecretStr = SecretStr("smarthire")
    postgres_db: str = "smarthire"

    # A full SQLAlchemy URL. When set it wins over the parts above — useful for a
    # managed database that hands you one connection string.
    database_url_override: str | None = Field(default=None, alias="DATABASE_URL")

    # Echo every SQL statement. Useful while learning; noisy in production.
    db_echo: bool = False

    # Connection pool. Each API process keeps up to pool_size + max_overflow connections
    # open, so (replicas x that sum) must stay under Postgres' max_connections.
    db_pool_size: int = Field(default=5, ge=1)
    db_max_overflow: int = Field(default=10, ge=0)
    db_pool_timeout_seconds: float = Field(default=30, gt=0)
    # Recycle connections older than this, before a firewall or proxy silently drops
    # an idle one. -1 disables recycling.
    db_pool_recycle_seconds: int = -1

    # --- Temporal (workflow orchestration) ------------------------------------------
    # host:port of the Temporal server's gRPC frontend. Compose overrides it to
    # temporal:7233 inside its network.
    temporal_address: str = "localhost:7233"
    # A namespace isolates workflows, like a database within a server.
    temporal_namespace: str = "default"
    # Workers poll a task queue by name; the API starts workflows on the same name. A
    # mismatch is silent: workflows wait forever for a worker that never polls.
    temporal_task_queue: str = "smarthire"

    # --- Redis ---------------------------------------------------------------------
    # Compose overrides the host to "redis" inside its network.
    redis_url: str = "redis://localhost:6379/0"
    redis_timeout_seconds: float = Field(default=1.0, gt=0)

    # --- Idempotency keys ------------------------------------------------------------
    # How long a completed request's response is kept for replay.
    idempotency_ttl_seconds: int = Field(default=86_400, ge=60)
    # How long an in-progress claim lasts if the process dies before finishing.
    idempotency_lock_seconds: int = Field(default=60, ge=1)

    # --- Publishing workflow ---------------------------------------------------------
    # Attempts per activity before a publish is given up and the job marked failed.
    publishing_max_attempts: int = Field(default=5, ge=1, le=20)
    # Fraction of activity attempts that fail on purpose, to demonstrate retries.
    # Zero outside a demo.
    publishing_fault_rate: float = Field(default=0.0, ge=0.0, le=1.0)

    # --- Worker -------------------------------------------------------------------
    # On SIGTERM the worker stops polling and gives activities already running this long
    # to finish; whatever is still running after that is cancelled, and Temporal retries
    # it. Keep it below the container's stop_grace_period, or Docker kills the process
    # first.
    worker_shutdown_grace_seconds: float = Field(default=20.0, ge=0)

    # --- Application processing workflow ---------------------------------------------
    # Attempts per activity (scoring, the confirmation message) before giving up.
    application_processing_max_attempts: int = Field(default=5, ge=1, le=20)

    # --- Business rules ------------------------------------------------------------
    # How many applications a candidate may have open at once. Applications in a terminal
    # stage (hired, rejected) do not count, so a rejected candidate is not locked out.
    max_applications_per_candidate: int = Field(default=10, ge=1)

    # Default page size and hard ceiling for list endpoints. The ceiling exists so a
    # client cannot request limit=1000000 and pull the whole table into memory.
    default_page_size: int = Field(default=20, ge=1)
    max_page_size: int = Field(default=100, ge=1)

    # --- Tests ---------------------------------------------------------------------
    # The suite creates this database on the same server and drops it afterwards.
    test_database_name: str = "smarthire_test"
    # A separate Redis logical database (0-15 exist by default), flushed by the tests.
    test_redis_url: str = "redis://localhost:6379/15"

    @model_validator(mode="after")
    def _check_consistency(self) -> "Settings":
        """Mistakes that would otherwise pass startup and break requests later."""
        if self.default_page_size > self.max_page_size:
            raise ValueError(
                f"DEFAULT_PAGE_SIZE ({self.default_page_size}) cannot exceed "
                f"MAX_PAGE_SIZE ({self.max_page_size})"
            )
        for name in ("redis_url", "test_redis_url"):
            if not getattr(self, name).startswith(("redis://", "rediss://", "unix://")):
                raise ValueError(f"{name.upper()} must start with redis://, rediss:// or unix://")
        return self

    @cached_property
    def database_url(self) -> str:
        """The URL the engine and Alembic connect with.

        Built with SQLAlchemy's URL.create rather than an f-string, so a password
        containing "@" or "/" is escaped instead of corrupting the URL.
        """
        if self.database_url_override:
            return self.database_url_override
        return URL.create(
            drivername="postgresql+asyncpg",
            username=self.postgres_user,
            password=self.postgres_password.get_secret_value(),
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        ).render_as_string(hide_password=False)


settings = Settings()
