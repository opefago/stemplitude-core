#!/usr/bin/env python
"""Docker health check for the Celery worker.

Exits 0 when the worker is alive and the broker is reachable.
Exits 1 otherwise — Docker marks the container unhealthy after
``retries`` consecutive failures, and ``restart: unless-stopped``
will recreate it once it exits.

Two checks (fast → thorough):
1. Redis PING — proves the broker is reachable.
2. Celery inspect ping — proves the worker process is responsive.
"""

import os
import sys


def main() -> int:
    broker_url = os.environ.get("CELERY_BROKER_URL", "")
    if not broker_url:
        print("CELERY_BROKER_URL not set", file=sys.stderr)
        return 1

    # 1. Lightweight: can we reach Redis at all?
    try:
        import redis

        r = redis.Redis.from_url(broker_url, socket_connect_timeout=5, socket_timeout=5)
        r.ping()
    except Exception as exc:
        print(f"Broker unreachable: {exc}", file=sys.stderr)
        return 1

    # 2. Thorough: is the worker process consuming from the broker?
    try:
        from workers.celery_app import celery_app

        result = celery_app.control.inspect(timeout=10).ping()
        if not result:
            print("No workers responded to ping", file=sys.stderr)
            return 1
    except Exception as exc:
        print(f"Worker inspect ping failed: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
