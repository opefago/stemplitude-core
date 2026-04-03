import logging

from workers.async_db import run_async_db
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)

AUDIT_RETENTION_DAYS = 180


@celery_app.task
def cleanup_audit_events():
    """Delete audit events older than the configured retention period."""
    logger.info("cleanup_audit_events started")
    from datetime import datetime, timedelta, timezone
    from app.audit.service import AuditService

    async def _cleanup():
        import app.database as db_mod

        cutoff = datetime.now(timezone.utc) - timedelta(days=AUDIT_RETENTION_DAYS)
        async with db_mod.async_session_factory() as db:
            service = AuditService(db)
            result = await service.cleanup(cutoff)
            return result.deleted_count

    deleted = run_async_db(_cleanup)
    logger.info("cleanup_audit_events completed deleted=%d", deleted)
    return {"deleted": deleted, "retention_days": AUDIT_RETENTION_DAYS}


@celery_app.task
def cleanup_expired_tokens():
    """Remove blacklisted tokens that lost their TTL.

    All blacklist keys are set with an ``EX`` TTL, so Redis evicts them
    automatically.  This task is a safety net for any keys that ended up
    without a TTL (e.g. due to a bug or manual intervention).
    """
    logger.info("cleanup_expired_tokens started")
    import asyncio
    from app.core.redis import get_redis

    # ``get_redis()`` caches a client on the current event loop; each
    # ``asyncio.run()`` uses a new loop, so drop the global before running.
    try:
        import app.core.redis as _redis_mod

        _redis_mod.redis_client = None
    except Exception:
        pass

    async def _cleanup():
        redis = await get_redis()
        cursor = "0"
        count = 0
        while cursor:
            cursor, keys = await redis.scan(
                cursor=cursor, match="auth:blacklist:*", count=200
            )
            for key in keys:
                ttl = await redis.ttl(key)
                if ttl == -1:
                    await redis.delete(key)
                    count += 1
            if cursor == b"0" or cursor == "0":
                break
        return count

    count = asyncio.run(_cleanup())
    logger.info("cleanup_expired_tokens completed cleaned=%d", count)


@celery_app.task
def cleanup_orphan_blobs():
    """Blob maintenance: repair DB rows that reference missing objects, then remove
    orphaned R2/S3 keys under ``tenants/`` and ``global/`` (not referenced by DB).
    """
    logger.info("cleanup_orphan_blobs started")
    from app.config import settings
    from app.core.blob_orphan_cleanup import run_orphan_blob_cleanup

    async def _go():
        return await run_orphan_blob_cleanup(
            dry_run=settings.BLOB_ORPHAN_CLEANUP_DRY_RUN
        )

    result = run_async_db(_go)
    dr = result.get("db_repair") or {}
    logger.info(
        "cleanup_orphan_blobs completed scanned=%d removed=%d dry_run=%s referenced=%d "
        "db_repair=%s",
        result["scanned"],
        result["removed"],
        result["dry_run"],
        result["referenced_count"],
        dr,
    )
    return result


@celery_app.task
def cleanup_expired_session_recordings():
    """Delete session recording blobs/metadata past retention expiry."""
    logger.info("cleanup_expired_session_recordings started")
    from datetime import datetime, timezone
    from sqlalchemy import select

    from app.classrooms.models import SessionRecording
    from app.config import settings
    from app.core import blob_storage

    async def _cleanup():
        import app.database as db_mod

        now = datetime.now(timezone.utc)
        deleted = 0
        async with db_mod.async_session_factory() as db:
            rows = (
                await db.execute(
                    select(SessionRecording).where(
                        SessionRecording.deleted_at.is_(None),
                        SessionRecording.retention_expires_at.isnot(None),
                        SessionRecording.retention_expires_at <= now,
                    )
                )
            ).scalars().all()
            for row in rows:
                if row.blob_key:
                    try:
                        blob_storage.delete_file(row.blob_key)
                    except Exception:
                        logger.exception("Failed deleting expired recording blob key=%s", row.blob_key)
                row.deleted_at = now
                row.status = "deleted"
                deleted += 1
            if deleted:
                await db.commit()
        return deleted

    removed = run_async_db(_cleanup)
    logger.info(
        "cleanup_expired_session_recordings completed deleted=%d retention_days=%d",
        removed,
        int(settings.SESSION_RECORDING_RETENTION_DAYS or 0),
    )
    return {"deleted": removed}


@celery_app.task
def cleanup_expired_support_grants():
    """Mark expired support access grants as expired."""
    logger.info("cleanup_expired_support_grants started")
    from datetime import datetime, timezone
    from sqlalchemy import update
    from app.tenants.models import SupportAccessGrant

    async def _cleanup():
        import app.database as db_mod

        async with db_mod.async_session_factory() as db:
            now = datetime.now(timezone.utc)
            result = await db.execute(
                update(SupportAccessGrant)
                .where(
                    SupportAccessGrant.status == "active",
                    SupportAccessGrant.expires_at < now,
                )
                .values(status="expired")
            )
            await db.commit()
            return result.rowcount

    count = run_async_db(_cleanup)
    logger.info("cleanup_expired_support_grants completed cleaned=%d", count)


@celery_app.task
def cleanup_notifications():
    """Delete in-app notifications older than retention and trim per-recipient overflow."""
    logger.info("cleanup_notifications started")
    from app.config import settings
    from app.notifications.retention import cleanup_notification_retention

    async def _cleanup():
        import app.database as db_mod

        async with db_mod.async_session_factory() as db:
            return await cleanup_notification_retention(
                db,
                retention_days=settings.NOTIFICATION_RETENTION_DAYS,
                max_per_recipient=settings.NOTIFICATION_MAX_PER_RECIPIENT,
            )

    result = run_async_db(_cleanup)
    logger.info(
        "cleanup_notifications completed older_than=%d cap_user=%d cap_student=%d",
        result["deleted_older_than"],
        result["capped_user_rows"],
        result["capped_student_rows"],
    )
    return result


@celery_app.task
def cleanup_email_logs():
    """Delete email delivery log rows older than :setting:`EMAIL_LOG_RETENTION_DAYS` (batched)."""
    logger.info("cleanup_email_logs started")
    from datetime import datetime, timedelta, timezone

    from app.config import settings
    from app.email.repository import EmailLogRepository

    retention = int(settings.EMAIL_LOG_RETENTION_DAYS or 0)
    if retention <= 0:
        logger.info("cleanup_email_logs skipped (EMAIL_LOG_RETENTION_DAYS is 0)")
        return {"deleted": 0, "skipped": True, "reason": "retention_disabled"}

    cutoff = datetime.now(timezone.utc) - timedelta(days=retention)

    async def _purge():
        import app.database as db_mod

        total = 0
        async with db_mod.async_session_factory() as db:
            repo = EmailLogRepository(db)
            while True:
                n = await repo.delete_batch_older_than(cutoff, batch_size=5000)
                await db.commit()
                if n <= 0:
                    break
                total += n
        return total

    deleted = run_async_db(_purge)
    logger.info(
        "cleanup_email_logs completed deleted=%d retention_days=%d",
        deleted,
        retention,
    )
    return {"deleted": deleted, "retention_days": retention}
