"""E2E integration test: subscription flow with real PostgreSQL + Redis."""

from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.tenants.models import Tenant


pytestmark = pytest.mark.integration


async def test_e2e_subscription_flow(
    client: AsyncClient,
    db_session,
    create_test_user,
    create_test_tenant: Tenant,
    super_admin_tenant_headers: dict,
) -> None:
    """Register -> Create tenant -> List subscriptions (empty) -> 404 on missing."""
    response = await client.get(
        "/api/v1/subscriptions/",
        headers=super_admin_tenant_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["items"] == []

    fake_id = uuid4()
    response = await client.get(
        f"/api/v1/subscriptions/{fake_id}",
        headers=super_admin_tenant_headers,
    )
    assert response.status_code == 404
