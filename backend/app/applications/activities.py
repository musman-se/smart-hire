"""Application processing activities — what happens after a candidate applies.

The brief: "when a candidate applies: record the application and initialise the hiring
stages [done synchronously, in the request], trigger candidate scoring, update analytics,
send notifications". Scoring and the notification run here, in the worker, so the
candidate's request returns as soon as the application is safely stored.

Both activities are idempotent, because Temporal may run either more than once:
- score_application recomputes from the same inputs and overwrites the same column;
- send_application_received inserts with ON CONFLICT DO NOTHING on a dedupe key, so a
  second run finds the row and sends nothing.

Analytics updates are Module 3's: they become consumers of application events on Kafka.
"""

import logging
import uuid

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from temporalio import activity
from temporalio.exceptions import ApplicationError

from app.applications.models import Application
from app.applications.scoring import score_match
from app.candidates.models import Candidate
from app.jobs.models import Job
from app.notifications.models import Notification
from app.publishing.models import job_extracted_skills
from app.skills.models import Skill

logger = logging.getLogger(__name__)

APPLICATION_NOT_FOUND = "ApplicationNotFound"


class ApplicationActivities:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = session_factory

    async def _load(
        self, session: AsyncSession, application_id: str
    ) -> tuple[Application, Job, Candidate]:
        application = await session.get(Application, uuid.UUID(application_id))
        if application is None:
            # Withdrawn applications still exist; only a deleted job or candidate
            # (cascading) removes one. Nothing to retry.
            raise ApplicationError(
                f"Application {application_id} does not exist.",
                type=APPLICATION_NOT_FOUND,
                non_retryable=True,
            )
        job = await session.get(Job, application.job_id)
        candidate = await session.get(Candidate, application.candidate_id)
        assert job is not None and candidate is not None  # foreign keys guarantee both
        return application, job, candidate

    @activity.defn(name="score_application")
    async def score_application(self, application_id: str) -> float:
        async with self._sessions() as session:
            application, job, candidate = await self._load(session, application_id)
            mentioned = set(
                await session.scalars(
                    select(Skill.name)
                    .join(job_extracted_skills, job_extracted_skills.c.skill_id == Skill.id)
                    .where(job_extracted_skills.c.job_id == job.id)
                )
            )
            result = score_match(
                candidate_skills=set(candidate.skills),
                candidate_years=candidate.years_experience,
                required_skills=set(job.required_skills),
                mentioned_skills=mentioned,
                min_years=job.min_experience_years,
            )
            await session.execute(
                update(Application)
                .where(Application.id == application.id)
                .values(match_score=result.score)
            )
            await session.commit()
        logger.info(
            "application_scored id=%s score=%s required=%d/%d other=%d/%d experience=%s",
            application_id,
            result.score,
            result.required_matched,
            result.required_total,
            result.other_matched,
            result.other_total,
            result.experience_ratio,
        )
        return result.score

    @activity.defn(name="send_application_received")
    async def send_application_received(self, application_id: str) -> bool:
        """Returns True if the message was sent now, False if it had been already."""
        async with self._sessions() as session:
            application, job, candidate = await self._load(session, application_id)
            inserted = await session.scalar(
                insert(Notification)
                .values(
                    dedupe_key=f"application_received:{application.id}",
                    kind="application_received",
                    channel="email",
                    recipient=candidate.email,
                    subject=f"We received your application: {job.title}",
                    body=(
                        f"Hi {candidate.full_name},\n\n"
                        f"Thank you for applying for {job.title}. Your application is in, "
                        "and you can follow its progress in your dashboard.\n\n"
                        "— The SmartHire team"
                    ),
                    application_id=application.id,
                )
                .on_conflict_do_nothing(index_elements=[Notification.dedupe_key])
                .returning(Notification.id)
            )
            await session.commit()

        if inserted is None:
            logger.info("notification_skipped kind=application_received app=%s", application_id)
            return False
        # The simulated delivery. With a real provider the order matters: the row is
        # committed above, so a crash right here would record a message that never left.
        # The safe shape is insert as "pending", call the provider with the dedupe key as
        # *its* idempotency key, then mark "sent" — a retry then re-calls the provider,
        # which recognises the key and does not send twice.
        logger.info(
            "notification_sent kind=application_received channel=email to=%s app=%s",
            candidate.email,
            application_id,
        )
        return True

    def all(self) -> list:
        return [self.score_application, self.send_application_received]
