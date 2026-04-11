import logging
from uuid import UUID

from workers.async_db import run_async_db
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task
def create_notification_task(
    user_id: str,
    tenant_id: str | None,
    notification_type: str,
    title: str,
    body: str | None = None,
):
    """Create a notification record asynchronously."""
    logger.info("create_notification_task started user_id=%s type=%s", user_id, notification_type)
    from app.notifications.models import Notification

    async def _create():
        import app.database as db_mod

        async with db_mod.async_session_factory() as db:
            tid = UUID(tenant_id) if tenant_id else None
            notification = Notification(
                user_id=UUID(user_id),
                student_id=None,
                tenant_id=tid,
                type=notification_type,
                title=title,
                body=body,
            )
            db.add(notification)
            await db.commit()
            logger.info("Notification created user=%s type=%s", user_id, notification_type)
            if tid:
                from app.realtime.user_events import publish_notifications_changed

                try:
                    await publish_notifications_changed(tid, UUID(user_id))
                except Exception:
                    logger.exception(
                        "Failed to publish notifications.changed realtime user=%s",
                        user_id,
                    )

    try:
        run_async_db(_create)
        logger.info("create_notification_task completed user_id=%s type=%s", user_id, notification_type)
    except Exception as exc:
        logger.error("create_notification_task failed user_id=%s type=%s: %s", user_id, notification_type, exc)
        raise


@celery_app.task
def create_student_notification_task(
    student_id: str,
    tenant_id: str,
    notification_type: str,
    title: str,
    body: str | None = None,
):
    """In-app notification for a student login (JWT sub = students.id)."""
    logger.info(
        "create_student_notification_task started student_id=%s type=%s",
        student_id,
        notification_type,
    )
    from app.notifications.models import Notification

    async def _create():
        import app.database as db_mod

        async with db_mod.async_session_factory() as db:
            tid = UUID(tenant_id)
            notification = Notification(
                user_id=None,
                student_id=UUID(student_id),
                tenant_id=tid,
                type=notification_type,
                title=title,
                body=body,
            )
            db.add(notification)
            await db.commit()
            logger.info(
                "Student notification created student=%s type=%s",
                student_id,
                notification_type,
            )
            from app.realtime.user_events import publish_notifications_changed

            try:
                await publish_notifications_changed(tid, UUID(student_id))
            except Exception:
                logger.exception(
                    "Failed to publish notifications.changed realtime student=%s",
                    student_id,
                )

    try:
        run_async_db(_create)
        logger.info(
            "create_student_notification_task completed student_id=%s type=%s",
            student_id,
            notification_type,
        )
    except Exception as exc:
        logger.error(
            "create_student_notification_task failed student_id=%s type=%s: %s",
            student_id,
            notification_type,
            exc,
        )
        raise
