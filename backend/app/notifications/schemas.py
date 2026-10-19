"""Notification schemas."""

from datetime import datetime

from app.core.schemas import ReadModel


class NotificationRead(ReadModel):
    kind: str
    channel: str
    recipient: str
    subject: str
    body: str
    sent_at: datetime
