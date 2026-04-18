from __future__ import annotations

from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.config import settings
from app.rate_limits.policy import clear_rate_limit_policy_cache
from app.roles.models import Role
from app.tenants.models import Membership
from tests.conftest import get_auth_token, make_user

pytestmark = pytest.mark.integration


@pytest.fixture
def test_rate_limit_config_file(tmp_path):
    config_path = tmp_path / "rate_limits.yaml"
    config_path.write_text(
        """
profiles:
  default:
    limit: 2
    window_seconds: 60
  strict_auth:
    limit: 1
    window_seconds: 60
  high_risk:
    limit: 10
    window_seconds: 60
  relaxed:
    limit: 10
    window_seconds: 60
endpoint_profiles:
  /api/v1/auth: default
  /api/v1/platform: high_risk
high_risk_prefixes:
  - /api/v1/auth/login
  - /api/v1/platform
failure_modes:
  default: open
  high_risk: closed
        """.strip(),
        encoding="utf-8",
    )
    return config_path


@pytest.fixture(autouse=True)
def _configure_rate_limits_for_test(test_rate_limit_config_file):
    original_path = settings.RATE_LIMITS_CONFIG_PATH
    original_enabled = settings.RATE_LIMITS_ENABLED
    settings.RATE_LIMITS_ENABLED = True
    settings.RATE_LIMITS_CONFIG_PATH = str(test_rate_limit_config_file)
    clear_rate_limit_policy_cache()
    yield
    settings.RATE_LIMITS_CONFIG_PATH = original_path
    settings.RATE_LIMITS_ENABLED = original_enabled
    clear_rate_limit_policy_cache()


async def test_authenticated_requests_are_throttled(
    client: AsyncClient, auth_headers: dict
) -> None:
    response_1 = await client.get("/api/v1/auth/me", headers=auth_headers)
    response_2 = await client.get("/api/v1/auth/me", headers=auth_headers)
    response_3 = await client.get("/api/v1/auth/me", headers=auth_headers)

    assert response_1.status_code == 200
    assert response_2.status_code == 200
    assert response_3.status_code == 429
    assert "Retry-After" in response_3.headers
    assert response_3.headers.get("X-RateLimit-Limit") == "2"
    assert "X-RateLimit-Remaining" in response_2.headers
    assert "X-RateLimit-Reset" in response_2.headers


async def test_skip_paths_not_throttled(client: AsyncClient) -> None:
    for _ in range(4):
        response = await client.get("/health")
        assert response.status_code == 200


async def test_anonymous_requests_are_throttled_by_ip(client: AsyncClient) -> None:
    # Anonymous flows use RATE_LIMITS_ANONYMOUS_PROFILE (strict_auth in env example).
    response_1 = await client.get(
        "/api/v1/auth/check-email",
        params={"email": "a@example.com"},
    )
    response_2 = await client.get(
        "/api/v1/auth/check-email",
        params={"email": "b@example.com"},
    )
    assert response_1.status_code == 200
    assert response_2.status_code == 429
    assert response_2.headers.get("X-RateLimit-Limit") == "1"


async def test_rate_limit_override_crud(
    client: AsyncClient, super_admin_tenant_headers: dict, create_test_tenant
) -> None:
    create_response = await client.put(
        "/api/v1/platform/rate-limits/overrides",
        headers=super_admin_tenant_headers,
        json={
            "scope_type": "tenant",
            "scope_id": str(create_test_tenant.id),
            "mode": "profile_only",
            "profile_key": "relaxed",
            "reason": "Temporary traffic spike",
        },
    )
    assert create_response.status_code == 200
    assert create_response.json()["profile_key"] == "relaxed"

    list_response = await client.get(
        "/api/v1/platform/rate-limits/overrides",
        headers=super_admin_tenant_headers,
    )
    assert list_response.status_code == 200
    assert any(
        row["scope_id"] == str(create_test_tenant.id)
        for row in list_response.json()["items"]
    )

    delete_response = await client.delete(
        f"/api/v1/platform/rate-limits/overrides/tenant/{create_test_tenant.id}",
        headers=super_admin_tenant_headers,
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True


async def test_rate_limit_custom_override_mode(
    client: AsyncClient, super_admin_tenant_headers: dict, create_test_tenant
) -> None:
    response = await client.put(
        "/api/v1/platform/rate-limits/overrides",
        headers=super_admin_tenant_headers,
        json={
            "scope_type": "tenant",
            "scope_id": str(create_test_tenant.id),
            "mode": "custom_only",
            "custom_limit": 77,
            "custom_window_seconds": 90,
            "reason": "Custom SLA",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "custom_only"
    assert payload["profile_key"] is None
    assert payload["custom_limit"] == 77
    assert payload["custom_window_seconds"] == 90


async def test_profile_plus_custom_override_applies_effective_limit(
    client: AsyncClient,
    super_admin_tenant_headers: dict,
    create_test_user,
) -> None:
    update = await client.put(
        "/api/v1/platform/rate-limits/overrides",
        headers=super_admin_tenant_headers,
        json={
            "scope_type": "user",
            "scope_id": str(create_test_user.id),
            "mode": "profile_plus_custom",
            "profile_key": "strict_auth",
            "custom_limit": 3,
            "reason": "Burst testing",
        },
    )
    assert update.status_code == 200

    effective = await client.get(
        "/api/v1/platform/rate-limits/effective",
        headers=super_admin_tenant_headers,
        params={"path": "/api/v1/auth/me", "user_id": str(create_test_user.id)},
    )
    assert effective.status_code == 200
    payload = effective.json()
    assert payload["user_profile"]["limit"] == 3
    assert payload["user_profile"]["window_seconds"] == 60


async def test_custom_only_override_can_decrease_limit(
    client: AsyncClient,
    super_admin_tenant_headers: dict,
    auth_headers: dict,
    create_test_user,
) -> None:
    update = await client.put(
        "/api/v1/platform/rate-limits/overrides",
        headers=super_admin_tenant_headers,
        json={
            "scope_type": "user",
            "scope_id": str(create_test_user.id),
            "mode": "custom_only",
            "custom_limit": 1,
            "custom_window_seconds": 60,
            "reason": "Temporary hard cap",
        },
    )
    assert update.status_code == 200

    ok = await client.get("/api/v1/auth/me", headers=auth_headers)
    blocked = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert ok.status_code == 200
    assert blocked.status_code == 429
    assert blocked.headers.get("X-RateLimit-Limit") == "1"


async def test_invalid_override_payload_rejected(
    client: AsyncClient,
    super_admin_tenant_headers: dict,
    create_test_tenant,
) -> None:
    invalid = await client.put(
        "/api/v1/platform/rate-limits/overrides",
        headers=super_admin_tenant_headers,
        json={
            "scope_type": "tenant",
            "scope_id": str(create_test_tenant.id),
            "mode": "custom_only",
            "reason": "missing custom values",
        },
    )
    assert invalid.status_code == 422


async def test_tenant_limit_shared_across_users(
    client: AsyncClient,
    db_session,
    create_test_tenant,
    create_test_user,
    super_admin_tenant_headers: dict,
) -> None:
    role_row = await db_session.execute(
        select(Role).where(Role.tenant_id == create_test_tenant.id, Role.slug == "admin")
    )
    role = role_row.scalar_one()

    user_two = make_user(email="second-user@example.com", id=uuid4())
    db_session.add(user_two)
    await db_session.flush()
    db_session.add(
        Membership(
            id=uuid4(),
            user_id=user_two.id,
            tenant_id=create_test_tenant.id,
            role_id=role.id,
            is_active=True,
        )
    )
    await db_session.flush()

    limit_update = await client.put(
        "/api/v1/platform/rate-limits/overrides",
        headers=super_admin_tenant_headers,
        json={
            "scope_type": "tenant",
            "scope_id": str(create_test_tenant.id),
            "mode": "custom_only",
            "custom_limit": 1,
            "custom_window_seconds": 60,
            "reason": "Shared tenant cap",
        },
    )
    assert limit_update.status_code == 200

    token_1 = get_auth_token(create_test_user, str(create_test_tenant.id))
    token_2 = get_auth_token(user_two, str(create_test_tenant.id))
    headers_1 = {
        "Authorization": f"Bearer {token_1}",
        "X-Tenant-ID": str(create_test_tenant.id),
    }
    headers_2 = {
        "Authorization": f"Bearer {token_2}",
        "X-Tenant-ID": str(create_test_tenant.id),
    }

    first = await client.get("/api/v1/auth/me", headers=headers_1)
    second = await client.get("/api/v1/auth/me", headers=headers_2)
    assert first.status_code == 200
    assert second.status_code == 429


async def test_redis_failure_hybrid_behavior(
    client: AsyncClient, monkeypatch
) -> None:
    from app.rate_limits.limiter import RedisRateLimiter

    async def _raise(*args, **kwargs):
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr(RedisRateLimiter, "consume", _raise)

    # default route class => fail open
    open_resp = await client.get(
        "/api/v1/auth/check-email",
        params={"email": "fresh@example.com"},
    )
    assert open_resp.status_code == 200

    # high_risk route class => fail closed
    closed_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "x"},
    )
    assert closed_resp.status_code == 429


async def test_policy_cache_redis_failure_does_not_break_requests(
    client: AsyncClient, monkeypatch, auth_headers: dict
) -> None:
    async def _raise(*args, **kwargs):
        raise RuntimeError("redis unavailable in policy cache")

    monkeypatch.setattr("app.rate_limits.policy.get_redis", _raise)
    response = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert response.status_code == 200
