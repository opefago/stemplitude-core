"""Enqueue branded transactional email via Celery (same path as invitations / classroom mail)."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.email.attachments import attachments_to_task_payload
from app.email.catalog import PreparedTransactionalEmail
from app.email.unsubscribe import resolve_prepared_message_for_send
from workers.tasks.email_tasks import send_email_task


def enqueue_transactional_email(
    *,
    to_email: str,
    prepared: PreparedTransactionalEmail,
    tenant_id: str | UUID | None = None,
) -> Any:
    """Queue :class:`PreparedTransactionalEmail` for delivery. Requires a running worker."""
    tid: str | None = str(tenant_id) if tenant_id is not None else None
    msg, _ = resolve_prepared_message_for_send(
        prepared,
        to_email=to_email.strip(),
        tenant_id=tenant_id,
    )
    return send_email_task.delay(
        to_email.strip(),
        prepared.subject,
        msg.plain,
        msg.html,
        tenant_id=tid,
        route_key=prepared.route_key,
        attachments=attachments_to_task_payload(prepared.attachments),
        list_unsubscribe_url=msg.list_unsubscribe_one_click_url,
    )


def enqueue_transactional_parts(
    *,
    to_email: str,
    subject: str,
    plain: str,
    html: str,
    route_key: str,
    tenant_id: str | UUID | None = None,
    attachments: list[dict[str, str]] | None = None,
) -> Any:
    """Lower-level enqueue when you already built ``html`` / ``plain`` (e.g. legacy call sites).

    ``attachments`` is the JSON-ready list from :func:`app.email.attachments.attachments_to_task_payload`.
    """
    tid: str | None = str(tenant_id) if tenant_id is not None else None
    return send_email_task.delay(
        to_email.strip(),
        subject,
        plain,
        html,
        tenant_id=tid,
        route_key=route_key,
        attachments=attachments,
        list_unsubscribe_url=None,
    )
