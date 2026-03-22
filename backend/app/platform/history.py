"""Redis-backed per-user command history.

Storage strategy:
  Key:    platform:cmd_history:{user_id}
  Type:   Redis LIST (newest at index 0)
  Cap:    MAX_HISTORY entries — LPUSH + LTRIM on every write
  TTL:    EXPIRE_DAYS — auto-cleanup for inactive users
  Values: JSON-encoded dicts, output truncated to MAX_OUTPUT_CHARS

Why Redis LIST over Sorted Set:
  - We only need chronological order (newest first) — LIST is natural.
  - LPUSH + LTRIM is O(1) amortized for bounded insertion.
  - No score conflicts to worry about.
  - LRANGE for pagination is O(N) where N = items returned, perfectly fine at 100 cap.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any
from uuid import UUID

from app.core.redis import get_redis

logger = logging.getLogger(__name__)

MAX_HISTORY = 100
MAX_OUTPUT_CHARS = 4096
EXPIRE_DAYS = 90
_KEY_PREFIX = "platform:cmd_history"


def _key(user_id: UUID) -> str:
    return f"{_KEY_PREFIX}:{user_id}"


def _truncate_output(output: str) -> str:
    if len(output) <= MAX_OUTPUT_CHARS:
        return output
    return output[:MAX_OUTPUT_CHARS] + "\n... (truncated)"


async def push_entry(
    user_id: UUID,
    *,
    entry_id: str,
    command: str,
    status: str,
    output: str,
) -> None:
    """Prepend a command history entry for a user, trimming to MAX_HISTORY."""
    redis = await get_redis()
    key = _key(user_id)

    entry = json.dumps({
        "id": entry_id,
        "command": command,
        "timestamp": int(time.time() * 1000),
        "status": status,
        "output": _truncate_output(output),
    })

    pipe = redis.pipeline()
    pipe.lpush(key, entry)
    pipe.ltrim(key, 0, MAX_HISTORY - 1)
    pipe.expire(key, EXPIRE_DAYS * 86400)
    await pipe.execute()


async def get_entries(
    user_id: UUID,
    offset: int = 0,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Return history entries for a user (newest first)."""
    redis = await get_redis()
    key = _key(user_id)
    raw_items = await redis.lrange(key, offset, offset + limit - 1)
    entries: list[dict[str, Any]] = []
    for raw in raw_items:
        try:
            entries.append(json.loads(raw))
        except (json.JSONDecodeError, TypeError):
            continue
    return entries


async def delete_entry(user_id: UUID, entry_id: str) -> bool:
    """Remove a specific history entry by its id.

    Redis LIST doesn't support random access delete by value efficiently,
    but at our cap of 100 this is negligible. We read the full list, filter,
    and rewrite. Only runs on explicit user action, not on every command.
    """
    redis = await get_redis()
    key = _key(user_id)
    raw_items = await redis.lrange(key, 0, -1)

    filtered: list[str] = []
    found = False
    for raw in raw_items:
        try:
            entry = json.loads(raw)
            if entry.get("id") == entry_id:
                found = True
                continue
        except (json.JSONDecodeError, TypeError):
            continue
        filtered.append(raw)

    if not found:
        return False

    pipe = redis.pipeline()
    pipe.delete(key)
    if filtered:
        pipe.rpush(key, *filtered)
        pipe.expire(key, EXPIRE_DAYS * 86400)
    await pipe.execute()
    return True


async def clear_all(user_id: UUID) -> int:
    """Delete all history for a user. Returns count of deleted entries."""
    redis = await get_redis()
    key = _key(user_id)
    count = await redis.llen(key)
    await redis.delete(key)
    return count
