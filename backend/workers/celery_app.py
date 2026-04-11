import logging

from celery import Celery
from celery.signals import worker_process_init

from app.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "stemplitude",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_always_eager=settings.CELERY_TASK_ALWAYS_EAGER,
    task_eager_propagates=True,
    # Store args/kwargs in the result backend so Platform / tooling can re-dispatch
    # failed jobs (see app.platform.jobs.retry_task). May include email bodies;
    # keep result_expires bounded (Celery default is typically 1 day).
    result_extended=True,
    # Broker reconnection: retry indefinitely so transient Redis restarts or
    # network blips don't permanently kill the worker / beat process.
    broker_connection_retry_on_startup=True,
    broker_connection_retry=True,
    broker_connection_max_retries=None,
    broker_connection_timeout=30,
    broker_transport_options={
        "retry_on_timeout": True,
        "socket_keepalive": True,
    },
)

# ``autodiscover_tasks(["workers.tasks"])`` would import ``workers.tasks.tasks`` (missing).
# ``autodiscover_tasks(["workers"])`` does not reliably load our package on all Celery versions.
import workers.orm_imports  # noqa: F401 — register full ``Base.metadata`` for worker ORM
import workers.tasks  # noqa: F401 — workers/tasks/__init__.py imports all *\_tasks modules

# Register cron schedules from ``config/job_registry.json`` (Pipeline.get_beat_schedule).
import workers.schedules  # noqa: F401, E402


@worker_process_init.connect
def _reset_db_pool_after_fork(**_kwargs) -> None:
    """Drop DB state inherited from the prefork parent (invalid in the child process)."""
    import app.database as db_mod

    try:
        db_mod.engine.sync_engine.dispose()
    except Exception:
        logger.debug("worker_process_init sync_engine.dispose failed", exc_info=True)

    # Replace the inherited engine with a fresh one so no asyncpg/socket state
    # from the parent is reused across per-task ``asyncio.run()`` loops.
    try:
        eng, fac = db_mod.create_loop_local_async_engine_and_sessionmaker()
        db_mod.engine = eng
        db_mod.async_session_factory = fac
    except Exception:
        logger.exception("worker_process_init failed to rebind database engine")

    try:
        import app.core.redis as redis_mod

        redis_mod.redis_client = None
    except Exception:
        logger.debug("worker_process_init redis reset failed", exc_info=True)
