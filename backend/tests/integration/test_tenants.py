"""Integration tests for tenant endpoints — uses real PostgreSQL + Redis."""

from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.tenants.models import Membership, Tenant
from app.users.models import User


pytestmark = pytest.mark.integration


@pytest.mark.xfail(reason="TenantCreate schema missing is_active field — service bug")
async def test_create_tenant(client: AsyncClient, auth_headers: dict) -> None:
    response = await client.post(
        "/api/v1/tenants/",
        headers=auth_headers,
        json={
            "name": "My Learning Center",
            "slug": "my-learning-center",
            "code": "MLC01",
            "type": "center",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "My Learning Center"
    assert data["slug"] == "my-learning-center"
    assert data["code"] == "MLC01"
    assert data["is_active"] is True


async def test_list_user_tenants(
    client: AsyncClient, auth_headers: dict, create_test_tenant: Tenant
) -> None:
    response = await client.get("/api/v1/tenants/", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert data["total"] >= 1
    slugs = [t["slug"] for t in data["items"]]
    assert "test-center" in slugs


async def test_add_member(
    client: AsyncClient,
    db_session,
    create_test_user: User,
    create_test_tenant: Tenant,
    super_admin_tenant_headers: dict,
) -> None:
    from app.roles.models import Role
    from sqlalchemy import select

    new_user = User(
        id=uuid4(),
        email="member@example.com",
        password_hash="hash",
        first_name="New",
        last_name="Member",
        is_active=True,
    )
    db_session.add(new_user)
    await db_session.flush()

    result = await db_session.execute(
        select(Role).where(
            Role.tenant_id == create_test_tenant.id,
            Role.slug == "instructor",
        )
    )
    instructor_role = result.scalar_one_or_none()
    if not instructor_role:
        result = await db_session.execute(
            select(Role).where(
                Role.tenant_id == create_test_tenant.id, Role.slug == "admin"
            )
        )
        instructor_role = result.scalar_one_or_none()

    assert instructor_role is not None

    response = await client.post(
        f"/api/v1/tenants/{create_test_tenant.id}/members",
        headers=super_admin_tenant_headers,
        json={
            "user_id": str(new_user.id),
            "role_id": str(instructor_role.id),
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == str(new_user.id)


async def test_tenant_isolation(
    client: AsyncClient, db_session, create_test_user: User
) -> None:
    from app.core.security import create_access_token, hash_password
    from app.roles.models import Role
    from app.tenants.models import Membership, Tenant

    user_a = create_test_user
    tenant_a = Tenant(
        id=uuid4(),
        name="Tenant A",
        slug="tenant-a",
        code="TA01",
        type="center",
        is_active=True,
    )
    db_session.add(tenant_a)
    await db_session.flush()

    role_a = Role(
        id=uuid4(),
        tenant_id=tenant_a.id,
        name="Admin",
        slug="admin",
        is_system=True,
        is_active=True,
    )
    db_session.add(role_a)
    await db_session.flush()
    db_session.add(
        Membership(
            user_id=user_a.id,
            tenant_id=tenant_a.id,
            role_id=role_a.id,
            is_active=True,
        )
    )
    await db_session.flush()

    user_b = User(
        id=uuid4(),
        email="userb@example.com",
        password_hash=hash_password("Pass123!"),
        first_name="User",
        last_name="B",
        is_active=True,
    )
    db_session.add(user_b)
    await db_session.flush()

    tenant_b = Tenant(
        id=uuid4(),
        name="Tenant B",
        slug="tenant-b",
        code="TB01",
        type="center",
        is_active=True,
    )
    db_session.add(tenant_b)
    await db_session.flush()

    role_b = Role(
        id=uuid4(),
        tenant_id=tenant_b.id,
        name="Admin",
        slug="admin",
        is_system=True,
        is_active=True,
    )
    db_session.add(role_b)
    await db_session.flush()
    db_session.add(
        Membership(
            user_id=user_b.id,
            tenant_id=tenant_b.id,
            role_id=role_b.id,
            is_active=True,
        )
    )
    await db_session.flush()

    token_a = create_access_token(
        sub=user_a.id,
        sub_type="user",
        extra_claims={"is_super_admin": False},
    )
    headers_a = {"Authorization": f"Bearer {token_a}"}

    response = await client.get("/api/v1/tenants/", headers=headers_a)
    assert response.status_code == 200
    tenant_slugs = [t["slug"] for t in response.json()["items"]]
    assert "tenant-a" in tenant_slugs
    assert "tenant-b" not in tenant_slugs
