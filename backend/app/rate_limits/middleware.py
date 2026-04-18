from __future__ import annotations

import logging
from typing import Iterable

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import settings
from app.core.redis import get_redis
from app.middleware.path_skips import rate_limit_middleware_skip_paths

from .limiter import RateLimitDecision, RedisRateLimiter
from .policy import RateLimitPolicyService

logger = logging.getLogger(__name__)


class ApiRateLimitMiddleware(BaseHTTPMiddleware):
    SKIP_PATHS = rate_limit_middleware_skip_paths()

    def __init__(self, app):
        super().__init__(app)
        self.policy_service = RateLimitPolicyService()
        self.limiter = RedisRateLimiter()

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path
        if not settings.RATE_LIMITS_ENABLED:
            return await call_next(request)
        if not path.startswith(settings.API_V1_PREFIX):
            return await call_next(request)
        if path in self.SKIP_PATHS:
            return await call_next(request)

        identity = getattr(request.state, "current_identity", None)
        tenant_ctx = getattr(request.state, "tenant", None)
        user_id = getattr(identity, "id", None)
        tenant_id = getattr(tenant_ctx, "tenant_id", None) or getattr(
            identity, "tenant_id", None
        )
        client_ip = (
            (request.client.host if request.client else "") or "unknown"
        ).strip()[:64]
        client_ip = client_ip or "unknown"

        policy = await self.policy_service.resolve(
            path=path, user_id=user_id, tenant_id=tenant_id
        )

        keys: list[tuple[str, str, int, int]] = []
        route_key = policy.route_profile_key
        if tenant_id is not None:
            keys.append(
                (
                    f"{settings.RATE_LIMITS_REDIS_KEY_PREFIX}:tenant:{tenant_id}:{route_key}",
                    "tenant",
                    policy.tenant_profile.limit,
                    policy.tenant_profile.window_seconds,
                )
            )
        if user_id is not None:
            keys.append(
                (
                    f"{settings.RATE_LIMITS_REDIS_KEY_PREFIX}:user:{user_id}:{route_key}",
                    "user",
                    policy.user_profile.limit,
                    policy.user_profile.window_seconds,
                )
            )
        if not keys:
            keys.append(
                (
                    f"{settings.RATE_LIMITS_REDIS_KEY_PREFIX}:ip:{client_ip}:{route_key}",
                    "anonymous",
                    policy.anonymous_profile.limit,
                    policy.anonymous_profile.window_seconds,
                )
            )

        decisions: list[RateLimitDecision] = []
        try:
            for key, _scope, limit, window in keys:
                decision = await self.limiter.consume(
                    key=key, limit=limit, window_seconds=window
                )
                decisions.append(decision)
                if not decision.allowed:
                    await self._record_event(
                        "throttled", path=path, route_class=policy.route_class
                    )
                    return self._blocked_response(decisions)
        except Exception as exc:
            if policy.failure_mode == "closed":
                await self._record_event("redis_failure_closed", path, policy.route_class)
                logger.warning(
                    "Rate limit fail-closed triggered path=%s class=%s err=%s",
                    path,
                    policy.route_class,
                    exc,
                )
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit service unavailable for this endpoint"},
                    headers={"Retry-After": "1"},
                )
            await self._record_event("redis_failure_open", path, policy.route_class)
            logger.warning(
                "Rate limit fail-open path=%s class=%s err=%s",
                path,
                policy.route_class,
                exc,
            )

        response = await call_next(request)
        self._apply_headers(response, decisions)
        return response

    @staticmethod
    def _most_restrictive(
        decisions: Iterable[RateLimitDecision],
    ) -> RateLimitDecision | None:
        entries = list(decisions)
        if not entries:
            return None
        return min(entries, key=lambda item: (item.remaining, item.reset_after_seconds))

    def _blocked_response(self, decisions: list[RateLimitDecision]) -> JSONResponse:
        chosen = self._most_restrictive(decisions)
        retry_after = chosen.retry_after_seconds if chosen else 1
        response = JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded"},
            headers={"Retry-After": str(max(1, retry_after))},
        )
        self._apply_headers(response, decisions)
        return response

    def _apply_headers(
        self, response: Response, decisions: list[RateLimitDecision]
    ) -> None:
        chosen = self._most_restrictive(decisions)
        if not chosen:
            return
        response.headers["X-RateLimit-Limit"] = str(chosen.limit)
        response.headers["X-RateLimit-Remaining"] = str(chosen.remaining)
        response.headers["X-RateLimit-Reset"] = str(chosen.reset_after_seconds)
        if not chosen.allowed:
            response.headers["Retry-After"] = str(max(1, chosen.retry_after_seconds))

    async def _record_event(self, event: str, path: str, route_class: str) -> None:
        try:
            redis = await get_redis()
            key = f"{settings.RATE_LIMITS_REDIS_KEY_PREFIX}:metrics:{event}"
            await redis.hincrby(key, route_class, 1)
            await redis.hincrby(key, "total", 1)
            await redis.expire(key, 7 * 24 * 3600)
            logger.info(
                "Rate limit event=%s class=%s path=%s",
                event,
                route_class,
                path,
            )
        except Exception:
            logger.debug("Rate limit metric write failed", exc_info=True)
