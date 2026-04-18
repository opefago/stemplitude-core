import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete

from workers.async_db import run_async_db
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task
def flush_feature_flag_metrics(flag_key: str | None = None):
    """Flush Redis aggregate buffers into ``feature_flag_metric_buckets``."""
    from app.feature_flags.provider import flush_feature_flag_metric_buffers

    async def _run():
        import app.database as db_mod

        async with db_mod.async_session_factory() as session:
            flushed = await flush_feature_flag_metric_buffers(session, flag_key=flag_key)
            await session.commit()
            return flushed

    flushed = run_async_db(_run)
    logger.info("flush_feature_flag_metrics completed flushed=%s flag_key=%s", flushed, flag_key)
    return {"flushed": int(flushed)}


@celery_app.task
def cleanup_feature_flag_debug_events(retention_days: int = 7):
    """Delete sampled debug rows; aggregate buckets remain source of truth."""
    from app.feature_flags.models import FeatureFlagDebugEvent

    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, int(retention_days)))

    async def _run():
        import app.database as db_mod

        async with db_mod.async_session_factory() as session:
            result = await session.execute(
                delete(FeatureFlagDebugEvent).where(FeatureFlagDebugEvent.created_at < cutoff)
            )
            await session.commit()
            return int(result.rowcount or 0)

    deleted = run_async_db(_run)
    logger.info("cleanup_feature_flag_debug_events deleted=%s cutoff=%s", deleted, cutoff.isoformat())
    return {"deleted": int(deleted)}
