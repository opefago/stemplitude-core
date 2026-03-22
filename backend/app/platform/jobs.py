"""Backend logic for the Job Worker monitoring page.

Provides job registry metadata, Celery/Redis stats, recent results,
and task control (retry, cancel).
"""

import json
import logging
from typing import Any

import redis as _redis

from app.config import settings
from app.core.pipeline import Pipeline
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def get_job_types() -> list[dict[str, Any]]:
    """Read the job registry and return metadata about all registered job types."""
    try:
        registry = Pipeline.get_registry()
    except Exception as e:
        logger.warning("Failed to load job registry: %s", e, exc_info=True)
        return []

    result: list[dict[str, Any]] = []
    for job_type, spec in registry.items():
        result.append({
            "job_type": job_type,
            "description": spec.description,
            "queue": spec.queue,
            "runtime": spec.runtime,
            "max_retries": spec.max_retries,
            "retry_delay": spec.retry_delay,
            "dedup_ttl": spec.dedup_ttl,
            "has_schedule": spec.schedule is not None,
            "schedule": spec.schedule,
        })
    return result


_INSPECT_TIMEOUT_S = 3.0

_NO_WORKERS_MSG = (
    "No Celery workers are online. Tasks stay queued until a worker runs. "
    "Local: cd backend && celery -A workers.celery_app worker --loglevel=info "
    "(same CELERY_BROKER_URL as the API). Docker: docker compose up -d celery_worker celery_beat."
)

_BROKER_FAIL_MSG = (
    "Cannot reach Celery broker (Redis). Check REDIS_URL / CELERY_BROKER_URL and that Redis is running."
)


def get_job_stats(redis_url: str | None = None) -> dict[str, Any]:
    """Query Celery/Redis for stats about running and active jobs.

    Uses Celery inspect API for active workers and tasks.
    ``available`` is True only when at least one worker responds to ping.
    """
    fallback: dict[str, Any] = {
        "available": False,
        "running_count": 0,
        "workers": [],
        "active_tasks": [],
        "message": _BROKER_FAIL_MSG,
    }

    try:
        inspect = celery_app.control.inspect(timeout=_INSPECT_TIMEOUT_S)
        if inspect is None:
            return fallback

        ping = inspect.ping()
        if not ping:
            return {
                "available": False,
                "running_count": 0,
                "workers": [],
                "active_tasks": [],
                "message": _NO_WORKERS_MSG,
            }

        workers = list(ping.keys())

        active = inspect.active() or {}
        active_tasks: list[dict[str, Any]] = []
        for worker_name, tasks in active.items():
            for t in tasks:
                task_info: dict[str, Any] = {
                    "id": t.get("id"),
                    "name": t.get("name"),
                    "worker": worker_name,
                }
                if "time_start" in t:
                    task_info["started_at"] = t["time_start"]
                elif "acknowledged" in t:
                    task_info["started_at"] = t.get("acknowledged")
                active_tasks.append(task_info)

        return {
            "available": True,
            "running_count": len(active_tasks),
            "workers": workers,
            "active_tasks": active_tasks,
            "message": None,
        }
    except Exception as e:
        logger.warning("Celery inspect failed: %s", e, exc_info=True)
        return {
            **fallback,
            "message": f"{_BROKER_FAIL_MSG} ({e})",
        }


def get_recent_results(redis_url: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    """Fetch recent task results from the Celery result backend (Redis).

    Celery stores results as celery-task-meta-{task_id} keys.
    Returns empty list if Redis or result backend is not available.
    """
    url = redis_url or settings.CELERY_RESULT_BACKEND
    if not url:
        return []

    try:
        # Parse Redis URL - Celery uses redis://host:port/db format
        r = _redis.Redis.from_url(url, decode_responses=True)
        pattern = "celery-task-meta-*"

        # Scan for keys and collect metadata
        collected: list[tuple[str, dict]] = []
        scan_limit = limit * 10  # Buffer to improve chance of getting recent ones
        count = 0

        for key in r.scan_iter(match=pattern, count=100):
            if count >= scan_limit:
                break
            count += 1
            try:
                raw = r.get(key)
                if not raw:
                    continue
                meta = json.loads(raw)
                task_id = meta.get("task_id") or key.replace("celery-task-meta-", "")
                date_done = meta.get("date_done")
                collected.append((date_done or "", {
                    "task_id": task_id,
                    "status": meta.get("status", "UNKNOWN"),
                    "result": meta.get("result"),
                    "date_done": date_done,
                    "task_name": meta.get("name"),
                }))
            except (json.JSONDecodeError, TypeError) as e:
                logger.debug("Skip invalid result key %s: %s", key, e)
                continue

        # Sort by date_done descending (most recent first)
        collected.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in collected[:limit]]
    except Exception as e:
        logger.warning("Failed to fetch recent results from Redis: %s", e, exc_info=True)
        return []


def retry_task(task_id: str) -> dict[str, Any]:
    """Look up a task in the result backend and attempt to re-dispatch it.

    Returns success/error message. Note: The Celery result backend does not
    store original task parameters (args/kwargs), so retry may not be possible
    for all tasks. We attempt to extract task name and match to job registry.
    """
    try:
        from celery.result import AsyncResult

        result = AsyncResult(task_id, app=celery_app)
        if not result.backend:
            return {"success": False, "error": "Result backend not configured"}

        meta = result.backend.get_task_meta(task_id)
        if not meta:
            return {"success": False, "error": f"Task {task_id} not found in result backend"}

        task_name = meta.get("name")
        if not task_name:
            return {
                "success": False,
                "error": "Task name not stored in result backend; cannot retry",
            }

        # Find job_type from registry by task_path
        registry = Pipeline.get_registry()
        job_type = None
        for jt, spec in registry.items():
            if spec.task_path == task_name:
                job_type = jt
                break

        if not job_type:
            return {
                "success": False,
                "error": f"Task {task_name} is not in the job registry; cannot retry via Pipeline",
            }

        spec = registry[job_type]
        # Check if task has required params - if not, we can retry with empty dict
        params_schema = spec.params_schema or {}
        required_params = [k for k, v in params_schema.items() if v.get("required")]
        if not required_params:
            try:
                task_id_new = Pipeline.dispatch(job_type, {})
                if task_id_new:
                    return {
                        "success": True,
                        "message": f"Task re-dispatched as {job_type}",
                        "task_id": task_id_new,
                    }
            except Exception as dispatch_err:
                logger.warning("Retry dispatch failed: %s", dispatch_err)
                return {"success": False, "error": str(dispatch_err)}

        # Result backend does not store original kwargs - we cannot retry without params
        return {
            "success": False,
            "error": (
                "Original task parameters are not stored in the result backend. "
                "Please dispatch a new job manually with the required parameters via the API."
            ),
            "job_type": job_type,
            "task_name": task_name,
        }
    except Exception as e:
        logger.warning("Retry task %s failed: %s", task_id, e, exc_info=True)
        return {"success": False, "error": str(e)}


def cancel_task(task_id: str) -> dict[str, Any]:
    """Revoke a running task. Uses Celery control revoke with terminate=True."""
    try:
        celery_app.control.revoke(task_id, terminate=True)
        return {"success": True, "message": f"Task {task_id} revocation sent"}
    except Exception as e:
        logger.warning("Cancel task %s failed: %s", task_id, e, exc_info=True)
        return {"success": False, "error": str(e)}
