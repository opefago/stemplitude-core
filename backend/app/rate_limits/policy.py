from __future__ import annotations

import time
from dataclasses import dataclass
import json
from pathlib import Path
from uuid import UUID

import yaml

from app.config import settings
from app.core.redis import get_redis
import app.database as db_module

from .repository import RateLimitOverrideRepository

@dataclass(frozen=True)
class RateLimitProfile:
    key: str
    limit: int
    window_seconds: int
    description: str | None = None


@dataclass(frozen=True)
class RateLimitPolicyConfig:
    profiles: dict[str, RateLimitProfile]
    endpoint_profiles: dict[str, str]
    high_risk_prefixes: tuple[str, ...]
    failure_modes: dict[str, str]


@dataclass(frozen=True)
class ResolvedRateLimitPolicy:
    route_class: str
    route_profile_key: str
    user_profile: RateLimitProfile
    tenant_profile: RateLimitProfile
    anonymous_profile: RateLimitProfile
    failure_mode: str


@dataclass(frozen=True)
class ScopeRateLimitOverride:
    mode: str
    profile_key: str | None
    custom_limit: int | None
    custom_window_seconds: int | None


_CONFIG_CACHE: tuple[float, RateLimitPolicyConfig] | None = None


def clear_rate_limit_policy_cache() -> None:
    global _CONFIG_CACHE
    _CONFIG_CACHE = None


def _config_file_path() -> Path:
    configured = settings.RATE_LIMITS_CONFIG_PATH.strip()
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[2] / "config" / "rate_limits.yaml"


def _load_config_uncached() -> RateLimitPolicyConfig:
    path = _config_file_path()
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else {}
    raw = raw if isinstance(raw, dict) else {}

    profiles_raw = raw.get("profiles", {})
    if not isinstance(profiles_raw, dict) or not profiles_raw:
        raise ValueError("rate_limits.yaml must define at least one profile")

    profiles: dict[str, RateLimitProfile] = {}
    for key, value in profiles_raw.items():
        if not isinstance(value, dict):
            raise ValueError(f"Profile '{key}' must be an object")
        limit = int(value.get("limit", 0))
        window_seconds = int(value.get("window_seconds", 0))
        if limit <= 0 or window_seconds <= 0:
            raise ValueError(f"Profile '{key}' must have positive limit/window_seconds")
        profiles[str(key)] = RateLimitProfile(
            key=str(key),
            limit=limit,
            window_seconds=window_seconds,
            description=(
                str(value.get("description")).strip()
                if value.get("description") is not None
                else None
            ),
        )

    endpoint_profiles_raw = raw.get("endpoint_profiles", {})
    endpoint_profiles = {
        str(path_prefix): str(profile_key)
        for path_prefix, profile_key in (endpoint_profiles_raw or {}).items()
    }

    high_risk_prefixes_raw = raw.get("high_risk_prefixes", [])
    high_risk_prefixes = tuple(str(prefix) for prefix in (high_risk_prefixes_raw or []))

    failure_modes_raw = raw.get("failure_modes", {})
    failure_modes = {
        "default": str((failure_modes_raw or {}).get("default", "open")).strip().lower(),
        "high_risk": str((failure_modes_raw or {}).get("high_risk", "closed")).strip().lower(),
    }
    return RateLimitPolicyConfig(
        profiles=profiles,
        endpoint_profiles=endpoint_profiles,
        high_risk_prefixes=high_risk_prefixes,
        failure_modes=failure_modes,
    )


async def get_rate_limit_policy_config() -> RateLimitPolicyConfig:
    global _CONFIG_CACHE
    now = time.time()
    ttl = max(1, int(settings.RATE_LIMITS_L1_TTL_SECONDS))
    if _CONFIG_CACHE and _CONFIG_CACHE[0] > now:
        return _CONFIG_CACHE[1]
    cfg = _load_config_uncached()
    _CONFIG_CACHE = (now + ttl, cfg)
    return cfg


def _resolve_profile_by_key(config: RateLimitPolicyConfig, profile_key: str) -> RateLimitProfile:
    if profile_key not in config.profiles:
        fallback = settings.RATE_LIMITS_DEFAULT_PROFILE
        if fallback in config.profiles:
            return config.profiles[fallback]
        return next(iter(config.profiles.values()))
    return config.profiles[profile_key]


def _route_profile_key(config: RateLimitPolicyConfig, path: str) -> str:
    best_match: tuple[int, str] | None = None
    for prefix, profile_key in config.endpoint_profiles.items():
        if path.startswith(prefix):
            score = len(prefix)
            if best_match is None or score > best_match[0]:
                best_match = (score, profile_key)
    if best_match:
        return best_match[1]
    return settings.RATE_LIMITS_DEFAULT_PROFILE


def _route_class(config: RateLimitPolicyConfig, path: str) -> str:
    for prefix in config.high_risk_prefixes:
        if path.startswith(prefix):
            return "high_risk"
    return "normal"


class RateLimitPolicyService:
    async def _override(
        self, scope_type: str, scope_id: UUID | None
    ) -> ScopeRateLimitOverride | None:
        if scope_id is None:
            return None
        cache_key = f"{settings.RATE_LIMITS_REDIS_KEY_PREFIX}:override:{scope_type}:{scope_id}"
        try:
            redis = await get_redis()
            cached = await redis.get(cache_key)
            if cached is not None:
                if cached == "__none__":
                    return None
                payload = json.loads(cached)
                return ScopeRateLimitOverride(
                    mode=str(payload.get("mode", "profile_only")),
                    profile_key=payload.get("profile_key"),
                    custom_limit=payload.get("custom_limit"),
                    custom_window_seconds=payload.get("custom_window_seconds"),
                )

            async with db_module.async_session_factory() as session:
                repo = RateLimitOverrideRepository(session)
                row = await repo.get_by_scope(scope_type, scope_id)
                override = (
                    ScopeRateLimitOverride(
                        mode=row.mode,
                        profile_key=row.profile_key,
                        custom_limit=row.custom_limit,
                        custom_window_seconds=row.custom_window_seconds,
                    )
                    if row
                    else None
                )
            if override is None:
                await redis.setex(cache_key, 60, "__none__")
            else:
                await redis.setex(
                    cache_key,
                    60,
                    json.dumps(
                        {
                            "mode": override.mode,
                            "profile_key": override.profile_key,
                            "custom_limit": override.custom_limit,
                            "custom_window_seconds": override.custom_window_seconds,
                        }
                    ),
                )
            return override
        except Exception:
            # Degrade gracefully when Redis/DB is unavailable; route-level defaults still apply.
            return None

    async def invalidate_override_cache(self, scope_type: str, scope_id: UUID) -> None:
        redis = await get_redis()
        cache_key = f"{settings.RATE_LIMITS_REDIS_KEY_PREFIX}:override:{scope_type}:{scope_id}"
        await redis.delete(cache_key)

    async def resolve(
        self,
        *,
        path: str,
        user_id: UUID | None,
        tenant_id: UUID | None,
    ) -> ResolvedRateLimitPolicy:
        config = await get_rate_limit_policy_config()
        route_profile_key = _route_profile_key(config, path)
        route_profile = _resolve_profile_by_key(config, route_profile_key)

        user_override = await self._override("user", user_id)
        tenant_override = await self._override("tenant", tenant_id)

        user_profile = self._effective_profile_for_scope(
            config=config, override=user_override, fallback=route_profile
        )
        tenant_profile = self._effective_profile_for_scope(
            config=config, override=tenant_override, fallback=route_profile
        )
        anonymous_profile = _resolve_profile_by_key(
            config, settings.RATE_LIMITS_ANONYMOUS_PROFILE
        )

        route_class = _route_class(config, path)
        failure_mode = config.failure_modes.get(
            route_class, config.failure_modes.get("default", "open")
        )
        failure_mode = "closed" if failure_mode == "closed" else "open"
        return ResolvedRateLimitPolicy(
            route_class=route_class,
            route_profile_key=route_profile.key,
            user_profile=user_profile,
            tenant_profile=tenant_profile,
            anonymous_profile=anonymous_profile,
            failure_mode=failure_mode,
        )

    @staticmethod
    def _effective_profile_for_scope(
        *,
        config: RateLimitPolicyConfig,
        override: ScopeRateLimitOverride | None,
        fallback: RateLimitProfile,
    ) -> RateLimitProfile:
        if override is None:
            return fallback

        mode = (override.mode or "profile_only").strip().lower()
        if mode not in {"profile_only", "custom_only", "profile_plus_custom"}:
            mode = "profile_only"

        base = fallback
        if mode in {"profile_only", "profile_plus_custom"} and override.profile_key:
            base = _resolve_profile_by_key(config, override.profile_key)

        if mode == "profile_only":
            return base

        if mode == "custom_only":
            if override.custom_limit and override.custom_window_seconds:
                return RateLimitProfile(
                    key=override.profile_key or "custom_only",
                    limit=int(override.custom_limit),
                    window_seconds=int(override.custom_window_seconds),
                    description="Custom-only override",
                )
            return base

        # profile_plus_custom
        return RateLimitProfile(
            key=override.profile_key or base.key,
            limit=int(override.custom_limit) if override.custom_limit else base.limit,
            window_seconds=(
                int(override.custom_window_seconds)
                if override.custom_window_seconds
                else base.window_seconds
            ),
            description=base.description,
        )
