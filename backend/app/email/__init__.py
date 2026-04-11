"""Email: providers, templates, typed presets, Celery outbox."""

from app.email.attachments import EmailAttachment
from app.email.catalog import (
    EmailRouteKey,
    PreparedTransactionalEmail,
    suggested_route_keys_for_platform_docs,
)
from app.email.outbox import enqueue_transactional_email, enqueue_transactional_parts

__all__ = [
    "EmailAttachment",
    "EmailRouteKey",
    "PreparedTransactionalEmail",
    "enqueue_transactional_email",
    "enqueue_transactional_parts",
    "suggested_route_keys_for_platform_docs",
]
