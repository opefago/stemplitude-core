"""Periodic class-session reminders for linked parents (tenant-configurable).

Tenants opt in via ``tenants.settings["class_session_reminders"]``:

.. code-block:: json

    {
      "enabled": true,
      "offsets_minutes_before": [30, 1440],
      "notify_linked_parents": true
    }

* ``offsets_minutes_before``: fire when the session is about that many minutes away
  (e.g. 30 = half an hour before, 1440 = one day before). Values must be between 5 and 10080 (7 days).
* Only **persisted** ``classroom_sessions`` rows are considered (not schedule-only synthetics).
* One in-app notification per (session, offset, parent user), tracked in ``class_session_reminder_sent``.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from sqlalchemy import and_, select

from workers.async_db import run_async_db
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _parse_class_session_reminder_settings(settings: dict[str, Any] | None) -> dict[str, Any] | None:
    if not settings:
        return None
    raw = settings.get("class_session_reminders")
    if not isinstance(raw, dict) or not raw.get("enabled"):
        return None
    raw_offsets = raw.get("offsets_minutes_before")
    if raw_offsets is None:
        raw_offsets = [30, 1440]
    if not isinstance(raw_offsets, list):
        return None
    offsets: list[int] = []
    for x in raw_offsets:
        try:
            n = int(x)
        except (TypeError, ValueError):
            continue
        if 5 <= n <= 10080:
            offsets.append(n)
    if not offsets:
        return None
    return {
        "offsets": sorted(set(offsets)),
        "notify_linked_parents": bool(raw.get("notify_linked_parents", True)),
    }


def _offset_phrase(offset_minutes: int) -> str:
    if offset_minutes == 1440:
        return "tomorrow"
    if offset_minutes >= 120:
        h = offset_minutes // 60
        return f"in {h} hours"
    if offset_minutes >= 60:
        return "in 1 hour"
    return f"in {offset_minutes} minutes"


def _format_session_local(session_start: datetime, tz_name: str | None) -> str:
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    name = (tz_name or "UTC").strip() or "UTC"
    try:
        zi = ZoneInfo(name)
    except ZoneInfoNotFoundError:
        zi = ZoneInfo("UTC")
    if session_start.tzinfo is None:
        st = session_start.replace(tzinfo=timezone.utc)
    else:
        st = session_start
    local = st.astimezone(zi)
    return local.strftime("%a %d %b · %I:%M %p").replace(" 0", " ")


@celery_app.task
def class_session_reminders_tick():
    """Scan tenants with reminders enabled; enqueue in-app notifications."""
    logger.info("class_session_reminders_tick started")

    async def _run():
        import app.database as db_mod

        from app.classrooms.models import ClassSessionReminderSent, Classroom, ClassroomSession
        from app.students.models import ParentStudent
        from app.tenants.models import Membership, Tenant
        from app.classrooms.models import ClassroomStudent

        now = datetime.now(timezone.utc)

        async with db_mod.async_session_factory() as db:
            tenant_rows = (
                await db.execute(
                    select(Tenant.id, Tenant.settings).where(Tenant.is_active.is_(True))
                )
            ).all()

        for tenant_id, tenant_settings in tenant_rows:
            cfg = _parse_class_session_reminder_settings(
                tenant_settings if isinstance(tenant_settings, dict) else None
            )
            if not cfg or not cfg["notify_linked_parents"]:
                continue

            async with db_mod.async_session_factory() as db:
                for offset in cfg["offsets"]:
                    slack = timedelta(minutes=10)
                    t_low = now + timedelta(minutes=offset) - slack
                    t_high = now + timedelta(minutes=offset) + slack
                    sessions = (
                        (
                            await db.execute(
                                select(ClassroomSession).where(
                                    ClassroomSession.tenant_id == tenant_id,
                                    ClassroomSession.status != "canceled",
                                    ClassroomSession.session_start > now,
                                    ClassroomSession.session_start >= t_low,
                                    ClassroomSession.session_start <= t_high,
                                )
                            )
                        )
                        .scalars()
                        .all()
                    )

                    for session in sessions:
                        classroom = await db.get(Classroom, session.classroom_id)
                        if not classroom or not classroom.is_active or classroom.deleted_at is not None:
                            continue

                        parent_rows = (
                            (
                                await db.execute(
                                    select(ParentStudent.user_id)
                                    .distinct()
                                    .join(
                                        ClassroomStudent,
                                        ClassroomStudent.student_id == ParentStudent.student_id,
                                    )
                                    .join(
                                        Membership,
                                        and_(
                                            Membership.user_id == ParentStudent.user_id,
                                            Membership.tenant_id == tenant_id,
                                            Membership.is_active.is_(True),
                                        ),
                                    )
                                    .where(ClassroomStudent.classroom_id == session.classroom_id)
                                )
                            )
                            .scalars()
                            .all()
                        )

                        when_local = _format_session_local(
                            session.session_start, classroom.timezone
                        )
                        phrase = _offset_phrase(offset)
                        title = f"Class {phrase}: {classroom.name}"
                        body = f"{classroom.name} starts {phrase} ({when_local})."

                        for user_id in parent_rows:
                            dup = await db.execute(
                                select(ClassSessionReminderSent.id).where(
                                    ClassSessionReminderSent.classroom_session_id == session.id,
                                    ClassSessionReminderSent.offset_minutes == offset,
                                    ClassSessionReminderSent.recipient_user_id == user_id,
                                )
                            )
                            if dup.scalar_one_or_none():
                                continue

                            db.add(
                                ClassSessionReminderSent(
                                    tenant_id=tenant_id,
                                    classroom_session_id=session.id,
                                    offset_minutes=offset,
                                    recipient_user_id=user_id,
                                )
                            )
                            await db.flush()

                            celery_app.send_task(
                                "workers.tasks.notification_tasks.create_notification_task",
                                kwargs={
                                    "user_id": str(user_id),
                                    "tenant_id": str(tenant_id),
                                    "notification_type": "class_session.reminder",
                                    "title": title,
                                    "body": body,
                                },
                                queue="default",
                            )

                await db.commit()

        logger.info("class_session_reminders_tick completed")

    try:
        run_async_db(_run)
    except Exception as exc:
        logger.exception("class_session_reminders_tick failed: %s", exc)
        raise
