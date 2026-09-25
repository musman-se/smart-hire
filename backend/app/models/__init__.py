"""SQLAlchemy models — the shapes stored in Postgres.

Every model must be imported here. Alembic diffs the live database against
`Base.metadata`, and a model that was never imported is not in that metadata — so
autogenerate would silently propose dropping its table.
"""

from app.models.application import Application
from app.models.base import Base
from app.models.candidate import Candidate
from app.models.job import Job

__all__ = ["Application", "Base", "Candidate", "Job"]
