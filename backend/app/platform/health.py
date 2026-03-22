"""Comprehensive health check probes for all platform services.

Each probe function returns a dict with:
    status: "healthy" | "degraded" | "down"
    latency_ms: int
    message: str
    details: dict  (service-specific metadata)
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

logger = logging.getLogger(__name__)


def _timed(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


# ─── 1. API Server ───────────────────────────────────────────────────────────

_BOOT_TIME = time.time()


async def check_api() -> dict[str, Any]:
    start = time.perf_counter()
    import os
    import platform as _platform

    from app.config import settings

    uptime_secs = int(time.time() - _BOOT_TIME)
    days, rem = divmod(uptime_secs, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, _ = divmod(rem, 60)
    uptime_str = f"{days}d {hours}h {minutes}m"

    return {
        "status": "healthy",
        "latency_ms": _timed(start),
        "message": "API server is operational",
        "details": {
            "app": settings.APP_NAME,
            "env": settings.APP_ENV,
            "python": _platform.python_version(),
            "pid": os.getpid(),
            "uptime": uptime_str,
        },
    }


# ─── 2. PostgreSQL ───────────────────────────────────────────────────────────

async def check_database() -> dict[str, Any]:
    start = time.perf_counter()
    try:
        from sqlalchemy import text

        from app.database import engine

        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))

        latency = _timed(start)
        pool = engine.pool
        pool_details: dict[str, Any] = {}
        if hasattr(pool, "size"):
            pool_details["pool_size"] = pool.size()
        if hasattr(pool, "checkedout"):
            pool_details["checked_out"] = pool.checkedout()
        if hasattr(pool, "overflow"):
            pool_details["overflow"] = pool.overflow()
        if hasattr(pool, "checkedin"):
            pool_details["checked_in"] = pool.checkedin()

        status = "healthy" if latency < 500 else "degraded"
        return {
            "status": status,
            "latency_ms": latency,
            "message": "Database connection OK" if status == "healthy" else "Elevated DB latency",
            "details": {
                "engine": "PostgreSQL (asyncpg)",
                **pool_details,
            },
        }
    except Exception as e:
        return {
            "status": "down",
            "latency_ms": _timed(start),
            "message": f"Database unreachable: {e}",
            "details": {},
        }


# ─── 3. Redis ────────────────────────────────────────────────────────────────

async def check_redis() -> dict[str, Any]:
    start = time.perf_counter()
    try:
        import redis as _redis

        from app.config import settings

        r = _redis.Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=5)
        r.ping()
        latency = _timed(start)

        info = r.info("memory")
        used_bytes = info.get("used_memory", 0)
        peak_bytes = info.get("used_memory_peak", 0)
        max_bytes = info.get("maxmemory", 0)

        def _fmt(b: int) -> str:
            if b < 1024 * 1024:
                return f"{b / 1024:.1f} KB"
            return f"{b / (1024 * 1024):.1f} MB"

        details: dict[str, Any] = {
            "used_memory": _fmt(used_bytes),
            "peak_memory": _fmt(peak_bytes),
        }
        if max_bytes > 0:
            details["max_memory"] = _fmt(max_bytes)
            pct = round(used_bytes / max_bytes * 100, 1)
            details["usage_pct"] = f"{pct}%"

        server_info = r.info("server")
        details["redis_version"] = server_info.get("redis_version", "unknown")
        details["connected_clients"] = r.info("clients").get("connected_clients", "?")

        status = "healthy" if latency < 200 else "degraded"
        r.close()
        return {
            "status": status,
            "latency_ms": latency,
            "message": "Redis connection OK" if status == "healthy" else "Elevated Redis latency",
            "details": details,
        }
    except Exception as e:
        return {
            "status": "down",
            "latency_ms": _timed(start),
            "message": f"Redis unreachable: {e}",
            "details": {},
        }


# ─── 4. S3/R2 Storage ────────────────────────────────────────────────────────

async def check_storage() -> dict[str, Any]:
    def _probe() -> dict[str, Any]:
        start = time.perf_counter()
        try:
            from app.config import settings
            from app.core.blob_storage import get_s3_client

            client = get_s3_client()
            client.head_bucket(Bucket=settings.S3_BUCKET_NAME)
            latency = _timed(start)

            status = "healthy" if latency < 1000 else "degraded"
            return {
                "status": status,
                "latency_ms": latency,
                "message": "Storage bucket accessible" if status == "healthy" else "Elevated storage latency",
                "details": {
                    "bucket": settings.S3_BUCKET_NAME,
                    "endpoint": settings.S3_ENDPOINT_URL,
                    "provider": "S3/R2",
                },
            }
        except Exception as e:
            return {
                "status": "down",
                "latency_ms": _timed(start),
                "message": f"Storage unreachable: {e}",
                "details": {},
            }
    return await asyncio.to_thread(_probe)


# ─── 5. Celery Workers ───────────────────────────────────────────────────────

async def check_celery() -> dict[str, Any]:
    def _probe() -> dict[str, Any]:
        start = time.perf_counter()
        try:
            from workers.celery_app import celery_app

            inspect = celery_app.control.inspect(timeout=3)
            ping_result = inspect.ping()
            latency = _timed(start)

            if not ping_result:
                return {
                    "status": "down",
                    "latency_ms": latency,
                    "message": "No Celery workers responding",
                    "details": {"workers": 0},
                }

            workers = list(ping_result.keys())
            active = inspect.active() or {}
            total_active = sum(len(t) for t in active.values())

            return {
                "status": "healthy",
                "latency_ms": latency,
                "message": f"{len(workers)} worker(s) online",
                "details": {
                    "workers": len(workers),
                    "worker_names": workers,
                    "active_tasks": total_active,
                },
            }
        except Exception as e:
            return {
                "status": "down",
                "latency_ms": _timed(start),
                "message": f"Celery broker unreachable: {e}",
                "details": {},
            }
    return await asyncio.to_thread(_probe)


# ─── 6. Postmark ─────────────────────────────────────────────────────────────

async def check_postmark(config: dict) -> dict[str, Any]:
    """Check Postmark API connectivity and account balance/quota.

    Postmark GET /server returns server info including SMTP credentials.
    GET /stats/outbound returns monthly sending stats.
    """
    start = time.perf_counter()
    server_token = config.get("server_token", "")
    if not server_token:
        return {
            "status": "down",
            "latency_ms": 0,
            "message": "Postmark server token not configured",
            "details": {},
        }

    try:
        import httpx

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.postmarkapp.com/server",
                headers={
                    "X-Postmark-Server-Token": server_token,
                    "Accept": "application/json",
                },
            )
            latency = _timed(start)

            if resp.status_code == 200:
                data = resp.json()
                server_name = data.get("Name", "")
                delivery_type = data.get("DeliveryType", "")

                details: dict[str, Any] = {
                    "server_name": server_name,
                    "delivery_type": delivery_type,
                    "color": data.get("Color", ""),
                }

                try:
                    account_resp = await client.get(
                        "https://api.postmarkapp.com/stats/outbound",
                        headers={
                            "X-Postmark-Server-Token": server_token,
                            "Accept": "application/json",
                        },
                    )
                    if account_resp.status_code == 200:
                        stats = account_resp.json()
                        details["sent"] = stats.get("Sent", 0)
                        details["bounced"] = stats.get("Bounced", 0)
                        details["spam_complaints"] = stats.get("SpamComplaints", 0)
                        details["bounce_rate"] = stats.get("BounceRate", 0)
                except Exception:
                    pass

                return {
                    "status": "healthy",
                    "latency_ms": latency,
                    "message": f"Postmark OK — server '{server_name}'",
                    "details": details,
                }
            elif resp.status_code == 401:
                return {
                    "status": "down",
                    "latency_ms": latency,
                    "message": "Postmark authentication failed — invalid server token",
                    "details": {},
                }
            else:
                return {
                    "status": "degraded",
                    "latency_ms": latency,
                    "message": f"Postmark returned HTTP {resp.status_code}",
                    "details": {"status_code": resp.status_code},
                }
    except Exception as e:
        return {
            "status": "down",
            "latency_ms": _timed(start),
            "message": f"Postmark unreachable: {e}",
            "details": {},
        }


# ─── 7. Mailgun ──────────────────────────────────────────────────────────────

async def check_mailgun(config: dict) -> dict[str, Any]:
    """Check Mailgun API connectivity and domain stats.

    GET /v3/domains/{domain} for domain info and state.
    GET /v3/{domain}/stats/total for recent sending stats.
    """
    start = time.perf_counter()
    api_key = config.get("api_key", "")
    domain = config.get("domain", "")
    if not api_key or not domain:
        return {
            "status": "down",
            "latency_ms": 0,
            "message": "Mailgun API key or domain not configured",
            "details": {},
        }

    try:
        import httpx

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.mailgun.net/v3/domains/{domain}",
                auth=("api", api_key),
            )
            latency = _timed(start)

            if resp.status_code == 200:
                data = resp.json()
                domain_info = data.get("domain", {})
                details: dict[str, Any] = {
                    "domain": domain_info.get("name", domain),
                    "state": domain_info.get("state", "unknown"),
                    "type": domain_info.get("type", "unknown"),
                    "is_disabled": domain_info.get("is_disabled", False),
                }

                try:
                    stats_resp = await client.get(
                        f"https://api.mailgun.net/v3/{domain}/stats/total",
                        auth=("api", api_key),
                        params={"event": ["accepted", "delivered", "failed"], "duration": "1m"},
                    )
                    if stats_resp.status_code == 200:
                        stats = stats_resp.json().get("stats", [])
                        if stats:
                            latest = stats[0]
                            details["accepted"] = latest.get("accepted", {}).get("total", 0)
                            details["delivered"] = latest.get("delivered", {}).get("total", 0)
                            details["failed_permanent"] = latest.get("failed", {}).get("permanent", {}).get("total", 0)
                            details["failed_temporary"] = latest.get("failed", {}).get("temporary", {}).get("total", 0)
                except Exception:
                    pass

                state = domain_info.get("state", "")
                status = "healthy" if state == "active" else "degraded"
                return {
                    "status": status,
                    "latency_ms": latency,
                    "message": f"Mailgun domain '{domain}' is {state}",
                    "details": details,
                }
            elif resp.status_code in (401, 403):
                return {
                    "status": "down",
                    "latency_ms": latency,
                    "message": "Mailgun authentication failed",
                    "details": {},
                }
            else:
                return {
                    "status": "degraded",
                    "latency_ms": latency,
                    "message": f"Mailgun returned HTTP {resp.status_code}",
                    "details": {"status_code": resp.status_code},
                }
    except Exception as e:
        return {
            "status": "down",
            "latency_ms": _timed(start),
            "message": f"Mailgun unreachable: {e}",
            "details": {},
        }


# ─── 8. AWS SES ──────────────────────────────────────────────────────────────

async def check_ses(config: dict) -> dict[str, Any]:
    """Check AWS SES connectivity and send quota."""
    def _probe() -> dict[str, Any]:
        start = time.perf_counter()
        region = config.get("region", "us-east-1")
        access_key = config.get("access_key_id", "")
        secret_key = config.get("secret_access_key", "")
        if not access_key or not secret_key:
            return {
                "status": "down",
                "latency_ms": 0,
                "message": "SES credentials not configured",
                "details": {},
            }

        try:
            import boto3

            client = boto3.client(
                "ses",
                region_name=region,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
            )

            quota = client.get_send_quota()
            latency = _timed(start)

            max_24h = quota.get("Max24HourSend", 0)
            sent_24h = quota.get("SentLast24Hours", 0)
            max_rate = quota.get("MaxSendRate", 0)
            remaining = max_24h - sent_24h

            usage_pct = round(sent_24h / max_24h * 100, 1) if max_24h > 0 else 0
            status = "healthy" if usage_pct < 80 else "degraded"

            return {
                "status": status,
                "latency_ms": latency,
                "message": f"SES OK — {int(remaining)} sends remaining today",
                "details": {
                    "region": region,
                    "max_24h_send": int(max_24h),
                    "sent_last_24h": int(sent_24h),
                    "remaining_24h": int(remaining),
                    "usage_pct": f"{usage_pct}%",
                    "max_send_rate": f"{max_rate}/sec",
                },
            }
        except Exception as e:
            return {
                "status": "down",
                "latency_ms": _timed(start),
                "message": f"SES unreachable: {e}",
                "details": {},
            }
    return await asyncio.to_thread(_probe)


# ─── 9. Stripe ────────────────────────────────────────────────────────────────

async def check_stripe() -> dict[str, Any]:
    def _probe() -> dict[str, Any]:
        start = time.perf_counter()
        try:
            from app.config import settings

            if not settings.STRIPE_SECRET_KEY:
                return {
                    "status": "down",
                    "latency_ms": 0,
                    "message": "Stripe secret key not configured",
                    "details": {},
                }

            import stripe

            stripe.api_key = settings.STRIPE_SECRET_KEY
            balance = stripe.Balance.retrieve()
            latency = _timed(start)

            available = balance.get("available", [])
            pending = balance.get("pending", [])
            details: dict[str, Any] = {
                "available_balances": [
                    {"amount": b["amount"] / 100, "currency": b["currency"].upper()}
                    for b in available
                ],
                "pending_balances": [
                    {"amount": b["amount"] / 100, "currency": b["currency"].upper()}
                    for b in pending
                ],
            }

            return {
                "status": "healthy",
                "latency_ms": latency,
                "message": "Stripe API accessible",
                "details": details,
            }
        except Exception as e:
            return {
                "status": "down",
                "latency_ms": _timed(start),
                "message": f"Stripe unreachable: {e}",
                "details": {},
            }
    return await asyncio.to_thread(_probe)


# ─── Run All Checks ──────────────────────────────────────────────────────────

async def run_all_checks(
    email_provider_configs: dict[str, dict] | None = None,
) -> dict[str, Any]:
    """Run all health check probes concurrently.

    Args:
        email_provider_configs: Dict of provider_name -> config dict
            e.g. {"postmark": {"server_token": "..."}, "mailgun": {...}, "ses": {...}}

    Returns full health report.
    """
    configs = email_provider_configs or {}

    tasks: dict[str, Any] = {
        "api": check_api(),
        "database": check_database(),
        "redis": check_redis(),
        "storage": check_storage(),
        "celery": check_celery(),
        "stripe": check_stripe(),
    }

    if configs.get("postmark"):
        tasks["postmark"] = check_postmark(configs["postmark"])
    if configs.get("mailgun"):
        tasks["mailgun"] = check_mailgun(configs["mailgun"])
    if configs.get("ses"):
        tasks["ses"] = check_ses(configs["ses"])

    results: dict[str, Any] = {}
    gathered = await asyncio.gather(
        *[_wrap_probe(name, coro) for name, coro in tasks.items()],
        return_exceptions=True,
    )

    for item in gathered:
        if isinstance(item, tuple):
            name, result = item
            results[name] = result
        elif isinstance(item, Exception):
            logger.error("Health probe exception: %s", item)

    healthy = sum(1 for r in results.values() if r.get("status") == "healthy")
    degraded = sum(1 for r in results.values() if r.get("status") == "degraded")
    down = sum(1 for r in results.values() if r.get("status") == "down")
    overall = "down" if down > 0 else ("degraded" if degraded > 0 else "healthy")

    return {
        "overall": overall,
        "healthy_count": healthy,
        "degraded_count": degraded,
        "down_count": down,
        "total_services": len(results),
        "services": results,
    }


async def _wrap_probe(name: str, coro) -> tuple[str, dict]:
    try:
        result = await coro
        return name, result
    except Exception as e:
        logger.error("Health probe %s failed: %s", name, e)
        return name, {
            "status": "down",
            "latency_ms": 0,
            "message": f"Probe error: {e}",
            "details": {},
        }


