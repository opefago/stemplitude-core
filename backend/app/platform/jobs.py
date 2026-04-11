"""Backend logic for the Job Worker monitoring page.

Provides job registry metadata, Celery/Redis stats, recent results,
and task control (retry, cancel).
"""

import json
import logging
from typing import Any

import redis as _redis
from celery import states

from app.config import settings
from app.core.pipeline import Pipeline
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)

# Celery task names that map to a registry job after renames (old broker messages / UI).
_TASK_NAME_REGISTRY_ALIASES: dict[str, str] = {
    "workers.tasks.email_tasks.send_email_task": "email.send",
}


def _registry_job_for_task_name(
    registry: dict[str, Any], task_name: str | None
) -> tuple[str | None, Any]:
    """Return ``(job_type, JobSpec)`` for a Celery task name, if registered."""
    if not task_name:
        return None, None
    for jt, spec in registry.items():
        if spec.task_path == task_name:
            return jt, spec
    alias = _TASK_NAME_REGISTRY_ALIASES.get(task_name)
    if alias and alias in registry:
        return alias, registry[alias]
    return None, None


def _humanize_celery_task_name(task_name: str | None) -> str:
    """Short readable label when a task is not in the job registry."""
    if not task_name:
        return "Background task"
    s = task_name
    for prefix in ("workers.tasks.", "app."):
        if s.startswith(prefix):
            s = s[len(prefix) :]
            break
    tail = s.split(".")[-1] if "." in s else s
    return tail.replace("_", " ").strip().title() or "Background task"


def _task_display_fields(
    registry: dict[str, Any], task_name: str | None
) -> dict[str, str | None]:
    """UI-friendly labels for a Celery task name."""
    jt, spec = _registry_job_for_task_name(registry, task_name)
    if jt and spec:
        desc = (spec.description or "").strip()
        return {
            "job_type": jt,
            "display_name": desc or jt.replace(".", " ").replace("_", " ").title(),
            "registry_description": desc or None,
        }
    return {
        "job_type": jt,
        "display_name": _humanize_celery_task_name(task_name),
        "registry_description": None,
    }


_EMAIL_TASK_NAMES = frozenset({
    "email.send",
    "workers.tasks.email_tasks.send_email_task",
})


def _sanitize_task_kwargs_for_display(task_name: str | None, kwargs: Any) -> Any:
    """Strip huge email bodies from extended-result kwargs for the platform UI."""
    if not isinstance(kwargs, dict):
        return kwargs
    name = (task_name or "").strip()
    if name in _EMAIL_TASK_NAMES:
        out: dict[str, Any] = {
            k: v
            for k, v in kwargs.items()
            if k in ("recipient", "subject", "tenant_id", "route_key")
        }
        body = kwargs.get("body")
        if isinstance(body, str):
            out["body_char_count"] = len(body)
        html_b = kwargs.get("html_body")
        if isinstance(html_b, str):
            out["html_body_char_count"] = len(html_b)
        att = kwargs.get("attachments")
        if isinstance(att, list):
            out["attachments_count"] = len(att)
        elif att is not None:
            out["attachments_count"] = 1
        if (kwargs.get("list_unsubscribe_url") or "").strip():
            out["list_unsubscribe_url_set"] = True
        return out
    truncated: dict[str, Any] = {}
    for k, v in kwargs.items():
        if isinstance(v, str) and len(v) > 800:
            truncated[k] = f"[omitted: {len(v)} characters]"
        else:
            truncated[k] = v
    return truncated


def _task_result_details(meta: dict[str, Any], task_name: str | None) -> dict[str, Any]:
    """Fields Celery stores alongside ``result`` when ``result_extended=True`` (worker, args, kwargs, traceback)."""
    details: dict[str, Any] = {}
    for key in ("worker", "queue", "retries", "parent_id", "root_id"):
        val = meta.get(key)
        if val is not None:
            details[key] = val
    tb = meta.get("traceback")
    if isinstance(tb, str) and tb.strip():
        details["traceback"] = tb
    args = meta.get("args")
    if args not in (None, [], ()):
        details["args"] = list(args) if isinstance(args, tuple) else args
    raw_kw = meta.get("kwargs")
    if isinstance(raw_kw, dict) and raw_kw:
        details["parameters"] = _sanitize_task_kwargs_for_display(task_name, raw_kw)
    return details


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

        try:
            registry_snapshot = Pipeline.get_registry()
        except Exception:
            registry_snapshot = {}

        active = inspect.active() or {}
        active_tasks: list[dict[str, Any]] = []
        for worker_name, tasks in active.items():
            for t in tasks:
                cname = t.get("name")
                labels = _task_display_fields(registry_snapshot, cname)
                task_info: dict[str, Any] = {
                    "id": t.get("id"),
                    "name": cname,
                    "display_name": labels["display_name"],
                    "job_type": labels["job_type"],
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

        try:
            registry_snapshot = Pipeline.get_registry()
        except Exception:
            registry_snapshot = {}

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
                meta = _enrich_task_meta_for_retry(task_id, meta)
                date_done = meta.get("date_done")
                task_name = meta.get("name")
                labels = _task_display_fields(registry_snapshot, task_name)
                details = _task_result_details(meta, task_name)
                collected.append((date_done or "", {
                    "task_id": task_id,
                    "status": meta.get("status", "UNKNOWN"),
                    "result": meta.get("result"),
                    "date_done": date_done,
                    "task_name": task_name,
                    "job_type": labels["job_type"],
                    "display_name": labels["display_name"],
                    "details": details,
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


def _enrich_task_meta_for_retry(task_id: str, meta: dict[str, Any]) -> dict[str, Any]:
    """Merge fields missing after Celery decode from the raw Redis JSON payload.

    Some workers/versions omit ``name`` (or ``args``/``kwargs``) in the decoded
    dict even though the key still holds them as plain JSON (same shape as
    :func:`get_recent_results` reads).
    """
    out = dict(meta)
    try:
        backend = celery_app.backend
        getter = getattr(backend, "get", None)
        key_fn = getattr(backend, "get_key_for_task", None)
        if not getter or not key_fn:
            return out
        raw = getter(key_fn(task_id))
        if not raw:
            return out
        if isinstance(raw, (bytes, bytearray)):
            raw = raw.decode("utf-8", errors="replace")
        blob = json.loads(raw)
    except (json.JSONDecodeError, TypeError, AttributeError, UnicodeDecodeError):
        return out
    if not isinstance(blob, dict):
        return out

    if not out.get("name") and blob.get("name"):
        out["name"] = blob["name"]
    if not out.get("queue") and blob.get("queue"):
        out["queue"] = blob["queue"]
    if out.get("args") is None and "args" in blob:
        out["args"] = blob["args"]
    if out.get("kwargs") is None and "kwargs" in blob:
        out["kwargs"] = blob["kwargs"]
    return out


def retry_task(task_id: str) -> dict[str, Any]:
    """Look up a task in the result backend and attempt to re-dispatch it.

    With ``result_extended=True`` (see ``workers.celery_app``), the backend
    retains ``args``/``kwargs`` so jobs like ``email.send`` can be retried.
    Otherwise only jobs with no required registry params can be re-dispatched
    (empty ``Pipeline.dispatch``).
    """
    try:
        from celery.result import AsyncResult

        result = AsyncResult(task_id, app=celery_app)
        backend = result.backend
        if not backend:
            return {"success": False, "error": "Result backend not configured"}

        meta = backend.get_task_meta(task_id, cache=False)

        key_fn = getattr(backend, "get_key_for_task", None)
        getter = getattr(backend, "get", None)
        raw_exists = False
        if key_fn and getter:
            try:
                raw_exists = bool(getter(key_fn(task_id)))
            except Exception:
                logger.debug("retry_task: could not probe result key", exc_info=True)

        if (
            meta.get("status") == states.PENDING
            and meta.get("result") is None
            and not raw_exists
        ):
            return {
                "success": False,
                "error": (
                    "No result record for this task id. It may have expired, or the id is wrong."
                ),
            }

        meta = _enrich_task_meta_for_retry(task_id, meta)

        task_name = meta.get("name")
        if not task_name:
            return {
                "success": False,
                "error": (
                    "This result has no task name, so it cannot be re-queued. "
                    "That usually means the task finished before "
                    "``result_extended`` was enabled, or the worker could not write "
                    "extended metadata. Enqueue a new job from the application instead."
                ),
            }

        registry = Pipeline.get_registry()
        job_type, spec = _registry_job_for_task_name(registry, task_name)

        raw_args = meta.get("args")
        raw_kwargs = meta.get("kwargs")
        args_tuple: tuple = ()
        if raw_args is not None:
            args_tuple = tuple(raw_args) if isinstance(raw_args, list) else raw_args
            if not isinstance(args_tuple, tuple):
                args_tuple = ()
        kwargs_dict: dict = {}
        if isinstance(raw_kwargs, dict):
            kwargs_dict = dict(raw_kwargs)

        has_payload = bool(args_tuple) or bool(kwargs_dict)
        if not has_payload:
            logger.info(
                "retry_task: no args/kwargs in result meta for task_id=%s name=%s keys=%s",
                task_id,
                task_name,
                sorted(meta.keys()),
            )

        if has_payload:
            queue = (spec.queue if spec else None) or meta.get("queue") or "default"
            try:
                async_result = celery_app.send_task(
                    task_name,
                    args=args_tuple,
                    kwargs=kwargs_dict,
                    queue=queue,
                )
                label = job_type or task_name
                return {
                    "success": True,
                    "message": f"Task re-dispatched ({label}) using stored arguments",
                    "task_id": async_result.id,
                    "job_type": job_type,
                }
            except Exception as dispatch_err:
                logger.warning("Retry send_task failed: %s", dispatch_err, exc_info=True)
                return {"success": False, "error": str(dispatch_err)}

        if not job_type or not spec:
            return {
                "success": False,
                "error": (
                    f"Task {task_name} is not in the job registry and the result backend "
                    "has no stored arguments to replay."
                ),
            }

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

        return {
            "success": False,
            "error": (
                "This task has required parameters, but the result backend has no stored "
                "args/kwargs for it. Enable Celery ``result_extended`` (see workers "
                "config), or enqueue a new job from the application."
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
