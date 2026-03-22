"""Integration tests for student endpoints — uses real PostgreSQL + Redis."""

import pytest
from httpx import AsyncClient

from app.students.models import Student
from app.tenants.models import Tenant


pytestmark = pytest.mark.integration


async def test_create_student(
    client: AsyncClient,
    super_admin_tenant_headers: dict,
    create_test_tenant: Tenant,
) -> None:
    response = await client.post(
        "/api/v1/students/",
        headers=super_admin_tenant_headers,
        json={
            "first_name": "Jane",
            "last_name": "Doe",
            "password": "StudentPass123!",
            "username": "janedoe",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["first_name"] == "Jane"
    assert data["last_name"] == "Doe"
    assert data["is_active"] is True


async def test_self_register(
    client: AsyncClient, create_test_tenant: Tenant
) -> None:
    response = await client.post(
        "/api/v1/students/self-register",
        json={
            "first_name": "Self",
            "last_name": "Register",
            "password": "SelfPass123!",
            "username": "selfreg",
            "tenant_slug": create_test_tenant.slug,
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["first_name"] == "Self"
    assert data["last_name"] == "Register"


async def test_check_username(
    client: AsyncClient, super_admin_tenant_headers: dict
) -> None:
    response = await client.get(
        "/api/v1/students/check-username?username=availableuser",
        headers=super_admin_tenant_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["available"] is True
    assert data["username"] == "availableuser"


async def test_list_students(
    client: AsyncClient,
    super_admin_tenant_headers: dict,
    create_test_student: Student,
) -> None:
    response = await client.get(
        "/api/v1/students/", headers=super_admin_tenant_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


async def test_enroll_student(
    client: AsyncClient,
    db_session,
    create_test_tenant: Tenant,
    create_test_student: Student,
    super_admin_tenant_headers: dict,
) -> None:
    from app.roles.models import Role
    from app.tenants.models import Tenant as T

    tenant_b = T(
        name="Center B",
        slug="center-b",
        code="CB01",
        type="center",
        is_active=True,
    )
    db_session.add(tenant_b)
    await db_session.flush()

    role_b = Role(
        tenant_id=tenant_b.id,
        name="Admin",
        slug="admin",
        is_system=True,
        is_active=True,
    )
    db_session.add(role_b)
    await db_session.flush()

    response = await client.post(
        f"/api/v1/students/{create_test_student.id}/enroll",
        headers=super_admin_tenant_headers,
        json={
            "tenant_id": str(tenant_b.id),
            "username": "student_in_b",
            "role": "student",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["student_id"] == str(create_test_student.id)
    assert data["tenant_id"] == str(tenant_b.id)
