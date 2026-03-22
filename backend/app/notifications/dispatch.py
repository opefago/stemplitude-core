"""Notification dispatch: in-app persistence and optional Celery for email / async fan-out.

Industry-style split (high signal vs noise):
- **Email**: transactional / high-signal only — classroom enrollment add/remove, account/security.
  Avoid email for every XP point, badge, or social reaction (use in-app + optional digests later).
- **In-app**: classroom enrollment rows are written on the API request's DB session so they appear
  without a Celery worker; gamification and other events may still use Celery tasks.

Classroom enrollment uses :func:`persist_classroom_enrollment_notifications` (same transaction as
enroll or unenroll). Email for that flow is still sent via Celery when configured.
"""

from __future__ import annotations

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.notifications.models import Notification
from app.realtime.user_events import publish_notifications_changed
from workers.tasks.email_tasks import send_email_task
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

    email_subject = f"Class enrollment update: {short}"
    plain = f"{student_first_name or 'A student'} was {action} {short}."
    html = f"<p>{plain}</p>"

    if student_email and student_email.strip():
        send_email_task.delay(
            student_email.strip(),
            email_subject,
            plain,
            html,
        )
    for em in parent_emails:
        if em and em.strip():
            send_email_task.delay(em.strip(), email_subject, plain, html)


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
