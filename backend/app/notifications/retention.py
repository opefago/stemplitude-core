"""Time- and cap-based cleanup for in-app notifications."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.notifications.models import Notification

logger = logging.getLogger(__name__)

_BATCH = 5000

_DELETE_EXCESS_PER_USER = text("""
DELETE FROM notifications
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM notifications
    WHERE user_id IS NOT NULL
  ) sub
  WHERE rn > :max_keep
)
""")

_DELETE_EXCESS_PER_STUDENT = text("""
DELETE FROM notifications
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY created_at DESC) AS rn
    FROM notifications
    WHERE student_id IS NOT NULL
  ) sub
  WHERE rn > :max_keep
)
""")


async def _delete_older_than_in_batches(session: AsyncSession, cutoff: datetime) -> int:
    """Remove notifications with created_at before cutoff; batched to limit lock duration."""
    total = 0
    while True:
        ids = (
            await session.execute(
                select(Notification.id)
                .where(Notification.created_at < cutoff)
                .limit(_BATCH)
            )
        ).scalars().all()
        if not ids:
            break
        await session.execute(delete(Notification).where(Notification.id.in_(ids)))
        await session.commit()
        total += len(ids)
        if len(ids) < _BATCH:
            break
    return total


async def cleanup_notification_retention(
    session: AsyncSession,
    *,
    retention_days: int,
    max_per_recipient: int,
) -> dict[str, int]:
    """Apply age retention and per-recipient caps. Commits internally.

    * ``retention_days`` — delete rows older than this many days; ``<= 0`` skips.
    * ``max_per_recipient`` — keep at most this many newest rows per user/student; ``<= 0`` skips caps.
    """
    deleted_older_than = 0
    capped_user_rows = 0
    capped_student_rows = 0

    if retention_days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
        deleted_older_than = await _delete_older_than_in_batches(session, cutoff)
        logger.info(
            "notification retention: deleted %d rows older than %s (%d days)",
            deleted_older_than,
            cutoff.isoformat(),
            retention_days,
        )

    if max_per_recipient > 0:
        r1 = await session.execute(
            _DELETE_EXCESS_PER_USER,
            {"max_keep": max_per_recipient},
        )
        await session.commit()
        capped_user_rows = r1.rowcount or 0
        logger.info(
            "notification retention: capped user recipients removed=%d (max=%d)",
            capped_user_rows,
            max_per_recipient,
        )

        r2 = await session.execute(
            _DELETE_EXCESS_PER_STUDENT,
            {"max_keep": max_per_recipient},
        )
        await session.commit()
        capped_student_rows = r2.rowcount or 0
        logger.info(
            "notification retention: capped student recipients removed=%d (max=%d)",
            capped_student_rows,
            max_per_recipient,
        )

    return {
        "deleted_older_than": deleted_older_than,
        "capped_user_rows": capped_user_rows,
        "capped_student_rows": capped_student_rows,
    }
