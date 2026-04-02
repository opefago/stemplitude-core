import logging
from datetime import date, datetime, timedelta, timezone

from workers.async_db import run_async_db
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task
def aggregate_progress_stats(tenant_id: str):
    """Back-compat alias: rebuild analytics rollups for yesterday (UTC)."""
    rebuild_tenant_analytics_day.delay(tenant_id, None)


@celery_app.task
def rebuild_tenant_analytics_day(tenant_id: str, bucket_date_iso: str | None):
    """Recompute ``tenant_analytics_daily`` for one tenant and UTC calendar day.

    ``bucket_date_iso`` as ``YYYY-MM-DD`` or None for yesterday UTC.
    """
    from uuid import UUID

    from app.analytics.rollup import rebuild_tenant_bucket_day

    tid = UUID(tenant_id)
    if bucket_date_iso:
        y, m, d = (int(x) for x in bucket_date_iso.split("-", 2))
        day = date(y, m, d)
    else:
        day = datetime.now(timezone.utc).date() - timedelta(days=1)

    async def _run():
        import app.database as db_mod

        async with db_mod.async_session_factory() as session:
            await rebuild_tenant_bucket_day(session, tid, day)
            await session.commit()

    try:
        run_async_db(_run)
        logger.info("rebuild_tenant_analytics_day ok tenant=%s day=%s", tenant_id, day)
    except Exception as exc:
        logger.error("rebuild_tenant_analytics_day failed tenant=%s: %s", tenant_id, exc)
        raise


@celery_app.task
def rebuild_all_tenants_analytics_day(bucket_date_iso: str | None = None):
    """Schedule rollup rebuild for every active tenant (yesterday UTC if date omitted)."""
    from app.analytics.rollup import list_active_tenant_ids

    async def _list():
        import app.database as db_mod

        async with db_mod.async_session_factory() as session:
            return await list_active_tenant_ids(session)

    try:
        ids = run_async_db(_list)
        for raw in ids:
            rebuild_tenant_analytics_day.delay(str(raw), bucket_date_iso)
        logger.info("rebuild_all_tenants_analytics_day scheduled count=%s", len(ids))
    except Exception as exc:
        logger.error("rebuild_all_tenants_analytics_day failed: %s", exc)
        raise


@celery_app.task
def generate_usage_report(tenant_id: str):
    """Reserved: usage report generation; rollups cover core learning metrics."""
    logger.info("generate_usage_report noop tenant_id=%s (use analytics rollups)", tenant_id)
