"""Integration tests for auth endpoints — uses real PostgreSQL + Redis."""

import pytest
from httpx import AsyncClient

from app.core.security import hash_password
from app.students.models import Student, StudentMembership
from app.tenants.models import Tenant
from app.users.models import User


pytestmark = pytest.mark.integration


async def test_register_user(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "newuser@example.com",
            "password": "SecurePass123!",
            "first_name": "New",
            "last_name": "User",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


async def test_login_user(client: AsyncClient, create_test_user: User) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "testuser@example.com",
            "password": "TestPassword123!",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


async def test_login_invalid_credentials(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "nonexistent@example.com",
            "password": "WrongPassword",
        },
    )
    assert response.status_code == 401
    assert "Invalid" in response.json().get("detail", "")


async def test_student_login_tenant_scoped(
    client: AsyncClient,
    db_session,
    create_test_tenant: Tenant,
) -> None:
    student = Student(
        first_name="Tenant",
        last_name="Student",
        email=None,
        password_hash=hash_password("StudentPass123!"),
        global_account=False,
        is_active=True,
    )
    db_session.add(student)
    await db_session.flush()

    membership = StudentMembership(
        student_id=student.id,
        tenant_id=create_test_tenant.id,
        username="tenantstudent",
        role="student",
        is_active=True,
    )
    db_session.add(membership)
    await db_session.flush()

    response = await client.post(
        "/api/v1/auth/student-login",
        json={
            "username": "tenantstudent",
            "tenant_slug": create_test_tenant.slug,
            "password": "StudentPass123!",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


async def test_student_login_global(client: AsyncClient, db_session) -> None:
    student = Student(
        first_name="Global",
        last_name="Student",
        email="global@example.com",
        password_hash=hash_password("GlobalPass123!"),
        global_account=True,
        is_active=True,
    )
    db_session.add(student)
    await db_session.flush()

    response = await client.post(
        "/api/v1/auth/student-login",
        json={
            "email": "global@example.com",
            "password": "GlobalPass123!",
        },
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


async def test_refresh_token(client: AsyncClient, create_test_user: User) -> None:
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "testuser@example.com",
            "password": "TestPassword123!",
        },
    )
    assert login_resp.status_code == 200
    refresh_token = login_resp.json()["refresh_token"]

    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


async def test_logout_revokes_tokens(client: AsyncClient, create_test_user: User) -> None:
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "testuser@example.com",
            "password": "TestPassword123!",
        },
    )
    assert login_resp.status_code == 200
    tokens = login_resp.json()

    response = await client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert response.status_code == 200
    assert "Logged out" in response.json()["detail"]

    refresh_resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert refresh_resp.status_code == 401


async def test_logout_all_devices(client: AsyncClient, create_test_user: User) -> None:
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "testuser@example.com",
            "password": "TestPassword123!",
        },
    )
    assert login_resp.status_code == 200
    tokens = login_resp.json()

    response = await client.post(
        "/api/v1/auth/logout-all",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert response.status_code == 200
    assert response.json()["revoked_count"] >= 1


async def test_get_me(client: AsyncClient, auth_headers: dict) -> None:
    response = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "testuser@example.com"
    assert data["first_name"] == "Test"
    assert data["sub_type"] == "user"


async def test_onboard_creates_user_and_tenant(client: AsyncClient) -> None:
    """POST /auth/onboard creates user + org atomically and returns tokens with tenant context."""
    response = await client.post(
        "/api/v1/auth/onboard",
        json={
            "email": "owner@academy.com",
            "password": "SecureP@ss123",
            "first_name": "Jane",
            "last_name": "Owner",
            "organization": {
                "name": "Robotics Academy",
                "slug": "robotics-academy",
                "type": "center",
            },
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["tenant_slug"] == "robotics-academy"
    assert data["tenant_name"] == "Robotics Academy"
    assert data["tenant_id"]

    me_resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {data['access_token']}"},
    )
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "owner@academy.com"


async def test_onboard_duplicate_email(client: AsyncClient) -> None:
    """Onboard rejects duplicate email."""
    payload = {
        "email": "dupcheck@academy.com",
        "password": "SecureP@ss123",
        "first_name": "First",
        "last_name": "User",
        "organization": {"name": "Org A", "slug": "org-a", "type": "center"},
    }
    resp1 = await client.post("/api/v1/auth/onboard", json=payload)
    assert resp1.status_code == 201

    payload["organization"] = {"name": "Org B", "slug": "org-b", "type": "center"}
    resp2 = await client.post("/api/v1/auth/onboard", json=payload)
    assert resp2.status_code == 400
    assert "Email already registered" in resp2.json()["detail"]


async def test_onboard_duplicate_slug(client: AsyncClient) -> None:
    """Onboard rejects duplicate org slug."""
    resp1 = await client.post(
        "/api/v1/auth/onboard",
        json={
            "email": "user1@slug.com",
            "password": "SecureP@ss123",
            "first_name": "User",
            "last_name": "One",
            "organization": {"name": "Slug Org", "slug": "slug-org", "type": "center"},
        },
    )
    assert resp1.status_code == 201

    resp2 = await client.post(
        "/api/v1/auth/onboard",
        json={
            "email": "user2@slug.com",
            "password": "SecureP@ss123",
            "first_name": "User",
            "last_name": "Two",
            "organization": {"name": "Another Org", "slug": "slug-org", "type": "center"},
        },
    )
    assert resp2.status_code == 409
    assert "already taken" in resp2.json()["detail"]


async def test_onboard_owner_can_access_tenant(
    client: AsyncClient, db_session
) -> None:
    """After onboard, the owner can hit tenant-scoped endpoints with X-Tenant-ID."""
    from uuid import uuid4
    from app.roles.models import Permission

    for res in ["roles", "students", "classrooms", "curriculum", "labs"]:
        for action in ["view", "create", "edit", "delete"]:
            db_session.add(Permission(id=uuid4(), resource=res, action=action))
    await db_session.flush()

    resp = await client.post(
        "/api/v1/auth/onboard",
        json={
            "email": "admin@mystem.com",
            "password": "SecureP@ss123",
            "first_name": "Admin",
            "last_name": "User",
            "organization": {"name": "My STEM", "slug": "my-stem", "type": "center"},
        },
    )
    assert resp.status_code == 201
    data = resp.json()

    roles_resp = await client.get(
        "/api/v1/roles/",
        headers={
            "Authorization": f"Bearer {data['access_token']}",
            "X-Tenant-ID": data["tenant_id"],
        },
    )
    assert roles_resp.status_code == 200
    role_slugs = [r["slug"] for r in roles_resp.json()]
    assert "owner" in role_slugs
    assert "admin" in role_slugs
    assert "instructor" in role_slugs
    assert "student" in role_slugs


async def test_check_email_available(client: AsyncClient) -> None:
    """Available email returns available=true."""
    resp = await client.get("/api/v1/auth/check-email", params={"email": "fresh@email.com"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["available"] is True
    assert data["value"] == "fresh@email.com"


async def test_check_email_taken(client: AsyncClient, create_test_user: User) -> None:
    """Registered email returns available=false."""
    resp = await client.get(
        "/api/v1/auth/check-email", params={"email": "testuser@example.com"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["available"] is False
    assert "already registered" in data["message"]


async def test_check_email_invalid(client: AsyncClient) -> None:
    """Invalid email format returns available=false with message."""
    resp = await client.get("/api/v1/auth/check-email", params={"email": "not-an-email"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["available"] is False
    assert "Invalid" in data["message"]


async def test_check_slug_available(client: AsyncClient) -> None:
    """Available slug returns available=true."""
    resp = await client.get("/api/v1/auth/check-slug", params={"slug": "cool-academy"})
    assert resp.status_code == 200
    assert resp.json()["available"] is True


async def test_check_slug_taken(client: AsyncClient, create_test_tenant: Tenant) -> None:
    """Taken slug returns available=false."""
    resp = await client.get(
        "/api/v1/auth/check-slug", params={"slug": create_test_tenant.slug}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["available"] is False
    assert "already taken" in data["message"]


async def test_check_slug_invalid_format(client: AsyncClient) -> None:
    """Invalid slug format returns available=false."""
    resp = await client.get("/api/v1/auth/check-slug", params={"slug": "HAS SPACES!"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["available"] is False
    assert "lowercase" in data["message"]


async def test_check_slug_too_short(client: AsyncClient) -> None:
    """Slug under 3 chars returns available=false."""
    resp = await client.get("/api/v1/auth/check-slug", params={"slug": "ab"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["available"] is False
    assert "3 characters" in data["message"]


async def test_resolve_tenant(client: AsyncClient, create_test_tenant: Tenant) -> None:
    response = await client.get(
        f"/api/v1/auth/tenants/resolve/{create_test_tenant.slug}"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["slug"] == create_test_tenant.slug
    assert data["name"] == create_test_tenant.name
    assert data["code"] == create_test_tenant.code
