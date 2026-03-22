"""Centralized job pipeline for dispatching background tasks.

The job registry is defined in ``backend/config/job_registry.json`` -- a single
language-agnostic source of truth that can be consumed by Python, Go, Rust,
or any other worker reading from the same Redis broker.

Usage:
    from app.core.pipeline import Pipeline

    Pipeline.dispatch("thumbnail.generate", {"asset_table": "assets", "asset_id": "..."})
    Pipeline.dispatch("email.send", {"recipient": "a@b.com", ...}, dedup_key="email:a@b.com:welcome")
"""

import hashlib
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

REGISTRY_PATH = Path(__file__).resolve().parents[2] / "config" / "job_registry.json"


@dataclass(frozen=True)
class JobSpec:
    """Specification for a registered job type."""

    job_type: str
    task_path: str
    queue: str = "default"
    runtime: str = "python"
    max_retries: int = 3
    retry_delay: int = 30
    dedup_ttl: int = 300
    description: str = ""
    params_schema: dict | None = None
    schedule: dict | None = None


class Pipeline:
    """Central orchestrator for background job dispatch."""

    _registry: dict[str, JobSpec] = {}
    _loaded: bool = False

    @classmethod
    def _ensure_loaded(cls) -> None:
        if cls._loaded:
            return
        cls._load_registry(REGISTRY_PATH)

    @classmethod
    def _load_registry(cls, path: Path) -> None:
        """Load job specs from the JSON registry file."""
        try:
            data = json.loads(path.read_text())
        except FileNotFoundError:
            logger.error("Job registry not found at %s", path)
            raise
        except json.JSONDecodeError:
            logger.error("Invalid JSON in job registry at %s", path)
            raise

        for job_type, spec_dict in data.get("jobs", {}).items():
            spec = JobSpec(
                job_type=job_type,
                task_path=spec_dict["task_path"],
                queue=spec_dict.get("queue", "default"),
                runtime=spec_dict.get("runtime", "python"),
                max_retries=spec_dict.get("max_retries", 3),
                retry_delay=spec_dict.get("retry_delay_seconds", 30),
                dedup_ttl=spec_dict.get("dedup_ttl_seconds", 300),
                description=spec_dict.get("description", ""),
                params_schema=spec_dict.get("params_schema"),
                schedule=spec_dict.get("schedule"),
            )
            cls._registry[job_type] = spec

        cron_count = sum(1 for s in cls._registry.values() if s.schedule)
        cls._loaded = True
        logger.info(
            "Job registry loaded: %d job types (%d cron) from %s",
            len(cls._registry), cron_count, path,
        )

    @classmethod
    def reload(cls) -> None:
        """Force-reload the registry (useful after editing job_registry.json)."""
        cls._registry.clear()
        cls._loaded = False
        cls._ensure_loaded()

    @classmethod
    def get_registry(cls) -> dict[str, JobSpec]:
        """Return a copy of the current registry."""
        cls._ensure_loaded()
        return dict(cls._registry)

    _CRONTAB_FIELDS = frozenset(
        ("minute", "hour", "day_of_week", "day_of_month", "month_of_year")
    )

    @classmethod
    def get_beat_schedule(cls) -> dict:
        """Build a Celery beat schedule from all jobs that have a ``schedule`` defined.

        Supported schedule types (``schedule.type``):

        * ``crontab`` (default) -- accepts ``minute``, ``hour``,
          ``day_of_week``, ``day_of_month``, ``month_of_year``.
          Values use standard cron syntax: ``*``, ``*/15``, ``1-5``,
          ``1,3,5``, ``1-15/3``, etc.
        * ``interval`` -- accepts ``every`` (integer) and ``period``
          (one of ``seconds``, ``minutes``, ``hours``, ``days``).

        Returns a dict suitable for ``celery_app.conf.beat_schedule``.
        """
        from datetime import timedelta

        from celery.schedules import crontab

        cls._ensure_loaded()
        beat: dict = {}

        for job_type, spec in cls._registry.items():
            if not spec.schedule:
                continue

            sched_type = spec.schedule.get("type", "crontab")

            if sched_type == "crontab":
                cron_kwargs = {
                    k: v for k, v in spec.schedule.items()
                    if k in cls._CRONTAB_FIELDS
                }
                celery_schedule = crontab(**cron_kwargs)

            elif sched_type == "interval":
                every = spec.schedule.get("every", 60)
                period = spec.schedule.get("period", "seconds")
                celery_schedule = timedelta(**{period: every})

            else:
                logger.warning(
                    "Unknown schedule type %r for job %s, skipping",
                    sched_type, job_type,
                )
                continue

            entry: dict = {
                "task": spec.task_path,
                "schedule": celery_schedule,
            }
            if spec.schedule.get("args"):
                entry["args"] = spec.schedule["args"]
            if spec.schedule.get("kwargs"):
                entry["kwargs"] = spec.schedule["kwargs"]
            beat[job_type] = entry

        logger.info("Beat schedule built: %d scheduled jobs", len(beat))
        return beat

    @classmethod
    def dispatch(
        cls,
        job_type: str,
        params: dict[str, Any],
        *,
        dedup_key: str | None = None,
        dedup_ttl: int | None = None,
        countdown: int | None = None,
    ) -> str | None:
        """Push a job to the background pipeline.

        Args:
            job_type: Registered job type (e.g. "thumbnail.generate").
            params: Dict of keyword arguments forwarded to the task.
            dedup_key: Optional explicit dedup key. If omitted, one is derived
                       from job_type + params so identical jobs aren't enqueued twice.
            dedup_ttl: Seconds the dedup lock is held. Defaults to the spec's dedup_ttl.
            countdown: Delay in seconds before the task executes.

        Returns:
            Celery task ID if enqueued, None if deduplicated away.
        """
        cls._ensure_loaded()

        spec = cls._registry.get(job_type)
        if not spec:
            logger.error("Unknown job type: %s", job_type)
            raise ValueError(f"Unknown job type: {job_type}")

        ttl = dedup_ttl or spec.dedup_ttl
        lock_key = (
            cls._dedup_key_hash(job_type, dedup_key)
            if dedup_key
            else cls._default_dedup_key(job_type, params)
        )

        if not cls._acquire_dedup_lock(lock_key, ttl):
            logger.info("Job deduplicated type=%s key=%s", job_type, lock_key)
            return None

        from workers.celery_app import celery_app

        result = celery_app.send_task(
            spec.task_path,
            kwargs=params,
            queue=spec.queue,
            countdown=countdown,
        )
        logger.info(
            "Job dispatched type=%s task_id=%s queue=%s",
            job_type,
            result.id,
            spec.queue,
        )
        return result.id

    @staticmethod
    def _dedup_key_hash(job_type: str, dedup_key: str) -> str:
        return f"pipeline:dedup:{job_type}:{hashlib.sha256(dedup_key.encode()).hexdigest()[:16]}"

    @staticmethod
    def _default_dedup_key(job_type: str, params: dict[str, Any]) -> str:
        """Derive a deterministic dedup key from job type + sorted params."""
        stable = json.dumps(params, sort_keys=True, default=str)
        return Pipeline._dedup_key_hash(job_type, stable)

    @staticmethod
    def _acquire_dedup_lock(lock_key: str, ttl: int) -> bool:
        """Try to set a Redis key with NX (set-if-not-exists). Returns True if acquired."""
        try:
            import redis as _redis
            from app.config import settings

            r = _redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
            acquired = r.set(lock_key, "1", nx=True, ex=ttl)
            return bool(acquired)
        except Exception:
            logger.warning("Dedup lock check failed, allowing dispatch", exc_info=True)
            return True
