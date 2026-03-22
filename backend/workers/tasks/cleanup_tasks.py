import logging

from workers.celery_app import celery_app

logger = logging.getLogger(__name__)

AUDIT_RETENTION_DAYS = 180


@celery_app.task
def cleanup_audit_events():
    """Delete audit events older than the configured retention period."""
    logger.info("cleanup_audit_events started")
    import asyncio
    from datetime import datetime, timedelta, timezone
    from app.database import async_session_factory
    from app.audit.service import AuditService

    async def _cleanup():
        cutoff = datetime.now(timezone.utc) - timedelta(days=AUDIT_RETENTION_DAYS)
        async with async_session_factory() as db:
            service = AuditService(db)
            result = await service.cleanup(cutoff)
            return result.deleted_count

    deleted = asyncio.run(_cleanup())
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
    """Remove orphaned files from R2/S3 that have no database reference.

    Lists objects under ``tenants/`` and ``global/``, compares to ``projects``,
    ``assets``, and ``global_assets`` blob/thumbnail keys, and deletes extras.
    """
    logger.info("cleanup_orphan_blobs started")
    import asyncio

    from app.config import settings
    from app.core.blob_orphan_cleanup import run_orphan_blob_cleanup

    result = asyncio.run(
        run_orphan_blob_cleanup(dry_run=settings.BLOB_ORPHAN_CLEANUP_DRY_RUN)
    )
    logger.info(
        "cleanup_orphan_blobs completed scanned=%d removed=%d dry_run=%s referenced=%d",
        result["scanned"],
        result["removed"],
        result["dry_run"],
        result["referenced_count"],
    )
    return result


@celery_app.task
def cleanup_expired_support_grants():
    """Mark expired support access grants as expired."""
    logger.info("cleanup_expired_support_grants started")
    import asyncio
    from datetime import datetime, timezone
    from sqlalchemy import select, update
    from app.database import async_session_factory
    from app.tenants.models import SupportAccessGrant

    async def _cleanup():
        async with async_session_factory() as db:
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

    count = asyncio.run(_cleanup())
    logger.info("cleanup_expired_support_grants completed cleaned=%d", count)


@celery_app.task
def cleanup_notifications():
    """Delete in-app notifications older than retention and trim per-recipient overflow."""
    logger.info("cleanup_notifications started")
    import asyncio

    from app.config import settings
    from app.database import async_session_factory
    from app.notifications.retention import cleanup_notification_retention

    async def _cleanup():
        async with async_session_factory() as db:
            return await cleanup_notification_retention(
                db,
                retention_days=settings.NOTIFICATION_RETENTION_DAYS,
                max_per_recipient=settings.NOTIFICATION_MAX_PER_RECIPIENT,
            )

    result = asyncio.run(_cleanup())
    logger.info(
        "cleanup_notifications completed older_than=%d cap_user=%d cap_student=%d",
        result["deleted_older_than"],
        result["capped_user_rows"],
        result["capped_student_rows"],
    )
    return result
