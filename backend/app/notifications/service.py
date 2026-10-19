"""Reading notifications."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.notifications.models import Notification


async def list_for_application(
    session: AsyncSession, application_id: uuid.UUID
) -> list[Notification]:
    rows = await session.scalars(
        select(Notification)
        .where(Notification.application_id == application_id)
        .order_by(Notification.sent_at, Notification.id)
    )
    return list(rows)
