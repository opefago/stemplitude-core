import logging

from workers.async_db import run_async_db
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task
def aggregate_progress_stats(tenant_id: str):
    """Aggregate progress statistics for a tenant's students.

    Collects lesson completion rates, lab scores, and time spent metrics.
    """
    logger.info("aggregate_progress_stats started tenant_id=%s", tenant_id)
    from uuid import UUID
    from sqlalchemy import func, select
    from app.progress.models import LessonProgress, LabProgress

    async def _aggregate():
        import app.database as db_mod

        async with db_mod.async_session_factory() as db:
            tid = UUID(tenant_id)

            lesson_stats = await db.execute(
                select(
                    func.count(LessonProgress.id).label("total"),
                    func.count(LessonProgress.completed_at).label("completed"),
                    func.avg(LessonProgress.score).label("avg_score"),
                    func.sum(LessonProgress.time_spent_seconds).label("total_time"),
                ).where(LessonProgress.tenant_id == tid)
            )

            lab_stats = await db.execute(
                select(
                    func.count(LabProgress.id).label("total"),
                    func.count(LabProgress.completed_at).label("completed"),
                    func.avg(LabProgress.score).label("avg_score"),
                    func.sum(LabProgress.time_spent_seconds).label("total_time"),
                ).where(LabProgress.tenant_id == tid)
            )

            # TODO: Store aggregated stats (e.g., in a stats table or cache)
            return {
                "lessons": lesson_stats.first()._asdict(),
                "labs": lab_stats.first()._asdict(),
            }

    try:
        result = run_async_db(_aggregate)
        logger.info("aggregate_progress_stats completed tenant_id=%s", tenant_id)
        return result
    except Exception as exc:
        logger.error("aggregate_progress_stats failed tenant_id=%s: %s", tenant_id, exc)
        raise


@celery_app.task
def generate_usage_report(tenant_id: str):
    """Generate usage report for a tenant (seat usage, active students, etc.)."""
    logger.info("generate_usage_report started tenant_id=%s", tenant_id)
    try:
        # TODO: Implement detailed usage reporting
        logger.info("generate_usage_report completed tenant_id=%s", tenant_id)
    except Exception as exc:
        logger.error("generate_usage_report failed tenant_id=%s: %s", tenant_id, exc)
        raise
