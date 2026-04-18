from __future__ import annotations

import json
from uuid import uuid4

import pytest

from app.config import settings
from app.rate_limits.limiter import RedisRateLimiter
from app.rate_limits.policy import (
    RateLimitPolicyService,
    clear_rate_limit_policy_cache,
    get_rate_limit_policy_config,
)


@pytest.mark.asyncio
async def test_policy_precedence_user_tenant_endpoint_default(tmp_path, fake_redis):
    original_path = settings.RATE_LIMITS_CONFIG_PATH
    original_default = settings.RATE_LIMITS_DEFAULT_PROFILE
    original_anon = settings.RATE_LIMITS_ANONYMOUS_PROFILE
    try:
        config_path = tmp_path / "rate_limits.yaml"
        config_path.write_text(
            """
profiles:
  default:
    limit: 200
    window_seconds: 60
  endpoint:
    limit: 150
    window_seconds: 60
  tenant_plus:
    limit: 400
    window_seconds: 60
  user_plus:
    limit: 600
    window_seconds: 60
  strict_auth:
    limit: 30
    window_seconds: 60
endpoint_profiles:
  /api/v1/auth: endpoint
high_risk_prefixes:
  - /api/v1/auth/login
failure_modes:
  default: open
  high_risk: closed
            """.strip(),
            encoding="utf-8",
        )
        settings.RATE_LIMITS_CONFIG_PATH = str(config_path)
        settings.RATE_LIMITS_DEFAULT_PROFILE = "default"
        settings.RATE_LIMITS_ANONYMOUS_PROFILE = "strict_auth"
        clear_rate_limit_policy_cache()

        user_id = uuid4()
        tenant_id = uuid4()
        await fake_redis.set(
            f"{settings.RATE_LIMITS_REDIS_KEY_PREFIX}:override:user:{user_id}",
            json.dumps(
                {
                    "mode": "profile_only",
                    "profile_key": "user_plus",
                    "custom_limit": None,
                    "custom_window_seconds": None,
                }
            ),
        )
        await fake_redis.set(
            f"{settings.RATE_LIMITS_REDIS_KEY_PREFIX}:override:tenant:{tenant_id}",
            json.dumps(
                {
                    "mode": "profile_only",
                    "profile_key": "tenant_plus",
                    "custom_limit": None,
                    "custom_window_seconds": None,
                }
            ),
        )

        policy = await RateLimitPolicyService().resolve(
            path="/api/v1/auth/me",
            user_id=user_id,
            tenant_id=tenant_id,
        )
        assert policy.user_profile.key == "user_plus"
        assert policy.tenant_profile.key == "tenant_plus"
        assert policy.route_profile_key == "endpoint"
        assert policy.anonymous_profile.key == "strict_auth"
        assert policy.failure_mode == "open"
    finally:
        settings.RATE_LIMITS_CONFIG_PATH = original_path
        settings.RATE_LIMITS_DEFAULT_PROFILE = original_default
        settings.RATE_LIMITS_ANONYMOUS_PROFILE = original_anon
        clear_rate_limit_policy_cache()


@pytest.mark.asyncio
async def test_token_bucket_blocks_after_limit(fake_redis):
    limiter = RedisRateLimiter()
    key = f"{settings.RATE_LIMITS_REDIS_KEY_PREFIX}:test:{uuid4()}"

    first = await limiter.consume(key=key, limit=2, window_seconds=60)
    second = await limiter.consume(key=key, limit=2, window_seconds=60)
    third = await limiter.consume(key=key, limit=2, window_seconds=60)

    assert first.allowed is True
    assert second.allowed is True
    assert third.allowed is False
    assert third.retry_after_seconds >= 1
    assert third.limit == 2


@pytest.mark.asyncio
async def test_policy_config_loads_profiles(tmp_path):
    original_path = settings.RATE_LIMITS_CONFIG_PATH
    try:
        config_path = tmp_path / "rate_limits.yaml"
        config_path.write_text(
            """
profiles:
  default:
    limit: 300
    window_seconds: 60
endpoint_profiles: {}
high_risk_prefixes: []
failure_modes:
  default: open
  high_risk: closed
            """.strip(),
            encoding="utf-8",
        )
        settings.RATE_LIMITS_CONFIG_PATH = str(config_path)
        clear_rate_limit_policy_cache()
        cfg = await get_rate_limit_policy_config()
        assert cfg.profiles["default"].limit == 300
    finally:
        settings.RATE_LIMITS_CONFIG_PATH = original_path
        clear_rate_limit_policy_cache()


@pytest.mark.asyncio
async def test_profile_plus_custom_override(tmp_path, fake_redis):
    original_path = settings.RATE_LIMITS_CONFIG_PATH
    original_default = settings.RATE_LIMITS_DEFAULT_PROFILE
    try:
        config_path = tmp_path / "rate_limits.yaml"
        config_path.write_text(
            """
profiles:
  default:
    limit: 100
    window_seconds: 60
  strict_auth:
    limit: 40
    window_seconds: 60
endpoint_profiles:
  /api/v1/auth: strict_auth
high_risk_prefixes: []
failure_modes:
  default: open
  high_risk: closed
            """.strip(),
            encoding="utf-8",
        )
        settings.RATE_LIMITS_CONFIG_PATH = str(config_path)
        settings.RATE_LIMITS_DEFAULT_PROFILE = "default"
        clear_rate_limit_policy_cache()

        user_id = uuid4()
        await fake_redis.set(
            f"{settings.RATE_LIMITS_REDIS_KEY_PREFIX}:override:user:{user_id}",
            json.dumps(
                {
                    "mode": "profile_plus_custom",
                    "profile_key": "strict_auth",
                    "custom_limit": 250,
                    "custom_window_seconds": 120,
                }
            ),
        )
        policy = await RateLimitPolicyService().resolve(
            path="/api/v1/auth/me",
            user_id=user_id,
            tenant_id=None,
        )
        assert policy.user_profile.limit == 250
        assert policy.user_profile.window_seconds == 120
    finally:
        settings.RATE_LIMITS_CONFIG_PATH = original_path
        settings.RATE_LIMITS_DEFAULT_PROFILE = original_default
        clear_rate_limit_policy_cache()
