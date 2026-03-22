from app.core.pipeline import Pipeline
from workers.celery_app import celery_app

celery_app.conf.beat_schedule = Pipeline.get_beat_schedule()
