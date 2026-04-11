#!/usr/bin/env python
"""Docker health check for Celery Beat.

Exits 0 when Beat is alive and the broker is reachable.
Exits 1 otherwise.

Beat doesn't respond to ``inspect ping`` (that's a worker-only command),
so we verify:
1. Redis broker is reachable (Beat needs it to publish scheduled tasks).
2. The Beat schedule DB file was modified recently (proves the scheduler
   loop is running — Beat touches it each tick).
"""

import os
import sys
import time
from pathlib import Path

SCHEDULE_FILE = Path("/tmp/celerybeat-schedule")
MAX_STALE_SECONDS = 600  # 10 minutes — Beat ticks every few seconds


def main() -> int:
    broker_url = os.environ.get("CELERY_BROKER_URL", "")
    if not broker_url:
        print("CELERY_BROKER_URL not set", file=sys.stderr)
        return 1

    # 1. Broker connectivity
    try:
        import redis

        r = redis.Redis.from_url(broker_url, socket_connect_timeout=5, socket_timeout=5)
        r.ping()
    except Exception as exc:
        print(f"Broker unreachable: {exc}", file=sys.stderr)
        return 1

    # 2. Schedule file freshness
    if SCHEDULE_FILE.exists():
        age = time.time() - SCHEDULE_FILE.stat().st_mtime
        if age > MAX_STALE_SECONDS:
            print(
                f"Beat schedule file stale ({age:.0f}s > {MAX_STALE_SECONDS}s)",
                file=sys.stderr,
            )
            return 1
    # File may not exist on first start — skip freshness check in that case

    return 0


if __name__ == "__main__":
    sys.exit(main())
