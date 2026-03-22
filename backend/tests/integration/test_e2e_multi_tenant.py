"""E2E integration test: multi-tenant isolation with real PostgreSQL + Redis."""

from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.core.security import create_access_token, hash_password
from app.tenants.models import Membership, Tenant
from app.users.models import User


pytestmark = pytest.mark.integration


async def test_e2e_multi_tenant_isolation(
    client: AsyncClient,
    db_session,
) -> None:
    """Verify tenant isolation — users cannot access other tenants' data."""
    from app.roles.models import Role

    user_a = User(
        id=uuid4(),
        email="usera@test.com",
        password_hash=hash_password("Pass123!"),
        first_name="User",
        last_name="A",
        is_active=True,
        is_super_admin=False,
    )
    db_session.add(user_a)
    await db_session.flush()

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
        email="userb@test.com",
        password_hash=hash_password("Pass123!"),
        first_name="User",
        last_name="B",
        is_active=True,
        is_super_admin=False,
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
        tenant_id=tenant_a.id,
        extra_claims={"is_super_admin": False},
    )
    headers_a = {"Authorization": f"Bearer {token_a}"}

    response = await client.get("/api/v1/tenants/", headers=headers_a)
    assert response.status_code == 200
    tenants = response.json()["items"]
    tenant_ids = [t["id"] for t in tenants]
    assert str(tenant_a.id) in tenant_ids
    assert str(tenant_b.id) not in tenant_ids

    headers_a_tenant_b = {
        "Authorization": f"Bearer {token_a}",
        "X-Tenant-ID": str(tenant_b.id),
    }
    response = await client.get(
        f"/api/v1/tenants/{tenant_b.id}",
        headers=headers_a_tenant_b,
    )
    assert response.status_code == 403
