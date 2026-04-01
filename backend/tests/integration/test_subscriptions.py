"""Integration tests for subscription endpoints — uses real PostgreSQL + Redis."""

import pytest
from httpx import AsyncClient

from app.tenants.models import Tenant


pytestmark = pytest.mark.integration


async def test_list_subscriptions(
    client: AsyncClient,
    super_admin_tenant_headers: dict,
    create_test_tenant: Tenant,
) -> None:
    response = await client.get(
        "/api/v1/subscriptions/", headers=super_admin_tenant_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)


async def test_list_tenant_invoices(
    client: AsyncClient,
    super_admin_tenant_headers: dict,
) -> None:
    response = await client.get(
        "/api/v1/subscriptions/invoices",
        headers=super_admin_tenant_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)
