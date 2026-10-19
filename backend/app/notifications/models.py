"""Notifications — every message the platform has sent, one row each.

Email delivery is simulated (the brief's background workers include notifications, and
no mail provider is in scope), but the record is real: what was sent, to whom, about
what, and when. The row is the proof a message went out.

The interesting column is dedupe_key, unique. Temporal runs an activity *at least*
once: a worker can send the message and crash before reporting success, and the
activity runs again. Inserting the row with ON CONFLICT (dedupe_key) DO NOTHING turns
that second run into a no-op, so the candidate gets one email, not two. A real email
provider call would pass the same key as the provider's own idempotency key.
"""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.models import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    # What makes this message unique, e.g. "application_received:<application id>".
    dedupe_key: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    recipient: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # Set for messages about an application; future kinds (a job published, say) may
    # concern no application at all, hence nullable.
    application_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("applications.id", ondelete="CASCADE"), index=True
    )
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
