"""Integration tests for capability endpoints — uses real PostgreSQL + Redis."""

import pytest
from httpx import AsyncClient

from app.capabilities.models import Capability, CapabilityRule
from app.tenants.models import Tenant


pytestmark = pytest.mark.integration


async def test_capability_check_allowed(
    client: AsyncClient,
    db_session,
    super_admin_tenant_headers: dict,
    create_test_tenant: Tenant,
) -> None:
    cap = Capability(
        key="test_allowed",
        name="Test Allowed",
        description="Test capability",
    )
    db_session.add(cap)
    await db_session.flush()

    rule = CapabilityRule(
        capability_id=cap.id,
        role_required=None,
        required_feature=None,
        seat_type=None,
        limit_key=None,
    )
    db_session.add(rule)
    await db_session.flush()

    response = await client.post(
        "/api/v1/capabilities/check",
        headers=super_admin_tenant_headers,
        json={"capability_key": "test_allowed"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "allowed" in data


async def test_capability_check_denied(
    client: AsyncClient,
    super_admin_tenant_headers: dict,
) -> None:
    response = await client.post(
        "/api/v1/capabilities/check",
        headers=super_admin_tenant_headers,
        json={"capability_key": "nonexistent_capability_xyz"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["allowed"] is False


async def test_seat_limit(
    client: AsyncClient,
    db_session,
    super_admin_tenant_headers: dict,
    create_test_tenant: Tenant,
) -> None:
    cap = Capability(
        key="test_seat_limit",
        name="Test Seat Limit",
        description="Capability with seat limit",
    )
    db_session.add(cap)
    await db_session.flush()

    rule = CapabilityRule(
        capability_id=cap.id,
        role_required=None,
        required_feature=None,
        seat_type="student",
        limit_key=None,
    )
    db_session.add(rule)
    await db_session.flush()

    response = await client.post(
        "/api/v1/capabilities/check",
        headers=super_admin_tenant_headers,
        json={"capability_key": "test_seat_limit"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "allowed" in data
