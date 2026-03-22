"""Integration tests for role endpoints — uses real PostgreSQL + Redis."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.roles.models import Permission, Role
from app.tenants.models import Tenant


pytestmark = pytest.mark.integration


async def test_list_roles(
    client: AsyncClient,
    super_admin_tenant_headers: dict,
    create_test_tenant: Tenant,
) -> None:
    response = await client.get(
        "/api/v1/roles/", headers=super_admin_tenant_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    slugs = [r["slug"] for r in data]
    assert "admin" in slugs
    assert "instructor" in slugs
    assert "student" in slugs


async def test_create_custom_role(
    client: AsyncClient,
    super_admin_tenant_headers: dict,
    create_test_tenant: Tenant,
) -> None:
    response = await client.post(
        "/api/v1/roles/",
        headers=super_admin_tenant_headers,
        json={"name": "Teaching Assistant", "slug": "teaching-assistant"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Teaching Assistant"
    assert data["slug"] == "teaching-assistant"
    assert data["is_system"] is False


async def test_assign_permissions(
    client: AsyncClient,
    db_session,
    super_admin_tenant_headers: dict,
    create_test_tenant: Tenant,
) -> None:
    custom_role = Role(
        tenant_id=create_test_tenant.id,
        name="Custom Role",
        slug="custom-role",
        is_system=False,
        is_active=True,
    )
    db_session.add(custom_role)
    await db_session.flush()

    result = await db_session.execute(
        select(Permission).where(
            Permission.resource == "students", Permission.action == "view"
        )
    )
    perm = result.scalar_one_or_none()
    if not perm:
        perm = Permission(
            resource="students", action="view", description="View students"
        )
        db_session.add(perm)
        await db_session.flush()

    response = await client.post(
        f"/api/v1/roles/{custom_role.id}/permissions",
        headers=super_admin_tenant_headers,
        json={"permission_ids": [str(perm.id)]},
    )
    assert response.status_code == 204
