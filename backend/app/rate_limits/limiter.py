from __future__ import annotations

import math
import time
from dataclasses import dataclass

from app.core.redis import get_redis

TOKEN_BUCKET_SCRIPT = """
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local refill_per_ms = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local ttl_ms = tonumber(ARGV[5])

local existing = redis.call("HMGET", key, "tokens", "ts")
local tokens = tonumber(existing[1])
local ts = tonumber(existing[2])
if tokens == nil then
  tokens = capacity
end
if ts == nil then
  ts = now_ms
end

if now_ms > ts then
  local refill = (now_ms - ts) * refill_per_ms
  tokens = math.min(capacity, tokens + refill)
end

local allowed = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end

redis.call("HMSET", key, "tokens", tostring(tokens), "ts", tostring(now_ms))
redis.call("PEXPIRE", key, ttl_ms)

local remaining = math.floor(tokens)
if remaining < 0 then
  remaining = 0
end

local retry_ms = 0
if allowed == 0 then
  retry_ms = math.ceil((cost - tokens) / refill_per_ms)
  if retry_ms < 0 then
    retry_ms = 0
  end
end

local reset_ms = math.ceil((capacity - tokens) / refill_per_ms)
if reset_ms < 0 then
  reset_ms = 0
end

return {allowed, remaining, retry_ms, reset_ms}
"""


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    limit: int
    remaining: int
    retry_after_seconds: int
    reset_after_seconds: int


class RedisRateLimiter:
    def __init__(self) -> None:
        self._sha: str | None = None

    async def _ensure_script(self) -> str:
        if self._sha:
            return self._sha
        redis = await get_redis()
        self._sha = await redis.script_load(TOKEN_BUCKET_SCRIPT)
        return self._sha

    async def consume(
        self, *, key: str, limit: int, window_seconds: int, cost: int = 1
    ) -> RateLimitDecision:
        redis = await get_redis()
        sha = await self._ensure_script()
        now_ms = int(time.time() * 1000)
        capacity = max(1, int(limit))
        window = max(1, int(window_seconds))
        refill_per_ms = capacity / (window * 1000.0)
        ttl_ms = max(window * 2000, 2000)
        args = [
            str(now_ms),
            str(capacity),
            f"{refill_per_ms:.12f}",
            str(max(1, int(cost))),
            str(ttl_ms),
        ]
        try:
            result = await redis.evalsha(sha, 1, key, *args)
        except Exception:
            result = await redis.eval(TOKEN_BUCKET_SCRIPT, 1, key, *args)
            self._sha = None
        allowed, remaining, retry_ms, reset_ms = [int(v) for v in result]
        return RateLimitDecision(
            allowed=bool(allowed),
            limit=capacity,
            remaining=max(0, remaining),
            retry_after_seconds=max(0, math.ceil(retry_ms / 1000)),
            reset_after_seconds=max(0, math.ceil(reset_ms / 1000)),
        )
