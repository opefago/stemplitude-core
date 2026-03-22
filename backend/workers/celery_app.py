from celery import Celery

from app.config import settings

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
)

celery_app.autodiscover_tasks(["workers.tasks"])

# Register cron schedules from ``config/job_registry.json`` (Pipeline.get_beat_schedule).
import workers.schedules  # noqa: F401, E402
