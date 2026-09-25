"""Application settings, read from the environment.

Pydantic reads each field from an environment variable of the same name (case-insensitive),
falling back to the default below. Same validation machinery as the API schemas — a bad
DATABASE_URL fails at startup rather than on the first query.

Business limits live here rather than as literals in the service code, so a rule can be
tuned per environment without a code change.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "SmartHire API"
    environment: str = "local"
    log_level: str = "INFO"

    # Overridden by the api service in docker-compose.yml, where the host is "db".
    database_url: str = "postgresql+asyncpg://smarthire:smarthire@localhost:5432/smarthire"

    # Echo every SQL statement. Useful while learning; noisy in production.
    db_echo: bool = False

    # --- Business rules ---
    # How many applications a candidate may have open at once. Applications in a terminal
    # stage (hired, rejected) do not count, so a rejected candidate is not locked out.
    max_applications_per_candidate: int = 10

    # Default page size and hard ceiling for list endpoints. The ceiling exists so a
    # client cannot request limit=1000000 and pull the whole table into memory.
    default_page_size: int = 20
    max_page_size: int = 100


settings = Settings()
