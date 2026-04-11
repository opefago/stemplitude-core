"""Notification dispatch: in-app persistence and optional Celery for email / async fan-out.

Industry-style split (high signal vs noise):
- **Email**: transactional / high-signal only — classroom enrollment add/remove, account/security.
  Avoid email for every XP point, badge, or social reaction (use in-app + optional digests later).
- **In-app**: classroom enrollment rows are written on the API request's DB session so they appear
  without a Celery worker; gamification and other events may still use Celery tasks.

Classroom enrollment uses :func:`persist_classroom_enrollment_notifications` (same transaction as
enroll or unenroll). Email is enqueued via :func:`app.email.outbox.enqueue_transactional_email`
(presets + Celery) when configured.
"""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.email.outbox import enqueue_transactional_email
from app.email.presets import build_classroom_enrollment_email
from app.notifications.models import Notification
from app.realtime.user_events import publish_notifications_changed
from workers.tasks.notification_tasks import create_student_notification_task

logger = logging.getLogger(__name__)


async def persist_classroom_enrollment_notifications(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    classroom_id: UUID,
    classroom_name: str,
    student_id: UUID,
    student_first_name: str,
    student_email: str | None,
    parent_user_ids: list[UUID],
    parent_emails: list[str | None],
    added: bool,
) -> None:
    """Write in-app notifications on ``db``, publish realtime hints, enqueue emails (Celery).

    In-app rows are not delegated to Celery so enrollment notifications work when no worker runs.
    """
    action = "added to" if added else "removed from"
    short = classroom_name.strip() or "a class"

    student_title = f"You were {action} {short}"
    student_body = (
        f"You have been {action} {short}. "
        + ("Welcome!" if added else "If this looks wrong, contact your school.")
    )
    db.add(
        Notification(
            user_id=None,
            student_id=student_id,
            tenant_id=tenant_id,
            type="classroom_enrollment",
            title=student_title,
            body=student_body,
            action_path=f"/app/classrooms/{classroom_id}",
            action_label="Open class",
        )
    )

    parent_title = f"{student_first_name or 'Your child'} was {action} {short}"
    parent_body = f"{student_first_name or 'Your child'} has been {action} {short}."
    for uid in parent_user_ids:
        db.add(
            Notification(
                user_id=uid,
                student_id=None,
                tenant_id=tenant_id,
                type="classroom_enrollment",
                title=parent_title,
                body=parent_body,
                action_path=f"/app/classrooms/{classroom_id}",
                action_label="Open class",
            )
        )

    await db.flush()

    try:
        await publish_notifications_changed(tenant_id, student_id)
    except Exception:
        logger.exception("publish notifications.changed failed student=%s", student_id)
    for uid in parent_user_ids:
        try:
            await publish_notifications_changed(tenant_id, uid)
        except Exception:
            logger.exception("publish notifications.changed failed user=%s", uid)

    prepared = build_classroom_enrollment_email(
        classroom_id=classroom_id,
        classroom_display_name=classroom_name,
        student_first_name=student_first_name,
        added=added,
    )

    if student_email and student_email.strip():
        enqueue_transactional_email(
            to_email=student_email.strip(),
            prepared=prepared,
            tenant_id=tenant_id,
        )
    for em in parent_emails:
        if em and em.strip():
            enqueue_transactional_email(
                to_email=em.strip(),
                prepared=prepared,
                tenant_id=tenant_id,
            )


def enqueue_student_in_app_only(
    *,
    tenant_id: UUID,
    student_id: UUID,
    notification_type: str,
    title: str,
    body: str | None = None,
) -> None:
    """In-app notification for a student; no email (gamification / live session activity)."""
    create_student_notification_task.delay(
        str(student_id),
        str(tenant_id),
        notification_type,
        title,
        body,
    )
