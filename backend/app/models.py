"""The model registry — every SQLAlchemy model, imported in one place.

Each domain declares its models in its own package (`app/jobs/models.py`, ...). This
module exists because SQLAlchemy and Alembic both need to see *all* of them at once:

- Alembic diffs the live database against `Base.metadata`, and a model that was never
  imported is not in that metadata — so autogenerate would propose dropping its table.
- Relationships are declared by class name (`relationship("Application")`), resolved
  only once every class is registered.

Anything that touches the database outside a request — Alembic, the test suite, a
background worker — imports this module first.
"""

from app.applications.models import Application
from app.candidates.models import Candidate
from app.core.models import Base
from app.jobs.models import Job
from app.skills.models import Skill, candidate_skills, job_skills

__all__ = [
    "Application",
    "Base",
    "Candidate",
    "Job",
    "Skill",
    "candidate_skills",
    "job_skills",
]
