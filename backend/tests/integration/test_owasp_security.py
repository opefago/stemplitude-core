"""OWASP Top 10 integration tests.

Verifies security posture against the 2021 OWASP Top 10 categories
using real PostgreSQL and Redis containers.

Reference: https://owasp.org/Top10/
"""

from __future__ import annotations

import base64
import json
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.core.security import create_access_token, hash_password
from app.roles.models import Permission

pytestmark = pytest.mark.integration

API = "/api/v1"


# ===================================================================
# Helpers
# ===================================================================


async def _setup_two_tenants(db_session):
    """Create two tenants each with their own admin user, returning headers."""
    from app.tenants.models import Tenant, Membership
    from app.roles.models import Role, RolePermission
    from app.users.models import User

    # Ensure shared permissions exist (unique on resource+action)
    perm_map: dict[str, Permission] = {}
    for res in ["classrooms", "students", "programs", "curriculum", "roles"]:
        result = await db_session.execute(
            select(Permission).where(Permission.resource == res, Permission.action == "*")
        )
        perm = result.scalar_one_or_none()
        if not perm:
            perm = Permission(id=uuid4(), resource=res, action="*")
            db_session.add(perm)
            await db_session.flush()
        perm_map[res] = perm

    tenants_data = []
    for i, (slug, code) in enumerate([("alpha-org", "ALPHA1"), ("beta-org", "BETA01")]):
        user = User(
            id=uuid4(),
            email=f"admin_{slug}@example.com",
            password_hash=hash_password(f"SecurePass{i}!"),
            first_name=f"Admin{i}",
            last_name="User",
            is_active=True,
            is_super_admin=False,
        )
        db_session.add(user)
        await db_session.flush()

        tenant = Tenant(
            id=uuid4(), name=f"Org {slug}", slug=slug,
            code=code, type="center", is_active=True,
        )
        db_session.add(tenant)
        await db_session.flush()

        admin_role = Role(
            id=uuid4(), tenant_id=tenant.id, name="Admin",
            slug="admin", is_system=True, is_active=True,
        )
        db_session.add(admin_role)
        await db_session.flush()

        for perm in perm_map.values():
            db_session.add(RolePermission(
                id=uuid4(), role_id=admin_role.id, permission_id=perm.id,
            ))
        await db_session.flush()

        db_session.add(Membership(
            id=uuid4(), user_id=user.id, tenant_id=tenant.id,
            role_id=admin_role.id, is_active=True,
        ))
        await db_session.flush()

        token = create_access_token(sub=user.id, sub_type="user", tenant_id=tenant.id)
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Tenant-ID": str(tenant.id),
        }
        tenants_data.append({
            "user": user, "tenant": tenant, "role": admin_role, "headers": headers,
        })

    return tenants_data


# ===================================================================
# A01:2021 — Broken Access Control
# ===================================================================


@pytest.mark.asyncio
class TestA01BrokenAccessControl:
    """BOLA, IDOR, privilege escalation, horizontal tenant isolation."""

    async def test_bola_cannot_access_other_tenants_classrooms(self, client, db_session):
        """User from Tenant A cannot list or access Tenant B classrooms."""
        tenants = await _setup_two_tenants(db_session)
        alpha, beta = tenants[0], tenants[1]

        # Alpha creates a classroom
        res = await client.post(f"{API}/classrooms/", json={
            "name": "Alpha Private Class", "mode": "online",
        }, headers=alpha["headers"])
        assert res.status_code == 201
        alpha_classroom_id = res.json()["id"]

        # Beta tries to list classrooms — should see nothing from Alpha
        res = await client.get(f"{API}/classrooms/", headers=beta["headers"])
        assert res.status_code == 200
        assert not any(c["id"] == alpha_classroom_id for c in res.json())

        # Beta tries to access Alpha's classroom directly
        res = await client.get(
            f"{API}/classrooms/{alpha_classroom_id}", headers=beta["headers"],
        )
        assert res.status_code == 404

    async def test_bola_cannot_access_other_tenants_students(self, client, db_session):
        """User from Tenant A cannot view Tenant B's students."""
        tenants = await _setup_two_tenants(db_session)
        alpha, beta = tenants[0], tenants[1]

        res = await client.post(f"{API}/students/", json={
            "first_name": "Alpha", "last_name": "Kid",
            "username": "alpha_kid", "password": "Student123!",
        }, headers=alpha["headers"])
        assert res.status_code == 201
        alpha_student_id = res.json()["id"]

        # Beta cannot see Alpha's students
        res = await client.get(f"{API}/students/", headers=beta["headers"])
        assert res.status_code == 200
        assert not any(s["id"] == alpha_student_id for s in res.json())

        # Beta cannot fetch Alpha's student directly
        res = await client.get(
            f"{API}/students/{alpha_student_id}", headers=beta["headers"],
        )
        assert res.status_code == 404

    async def test_bola_cannot_access_other_tenants_programs(self, client, db_session):
        """User from Tenant A cannot access Tenant B's programs."""
        tenants = await _setup_two_tenants(db_session)
        alpha, beta = tenants[0], tenants[1]

        res = await client.post(f"{API}/programs/", json={
            "name": "Alpha Secret Program",
        }, headers=alpha["headers"])
        assert res.status_code == 201
        prog_id = res.json()["id"]

        res = await client.get(f"{API}/programs/{prog_id}", headers=beta["headers"])
        assert res.status_code == 404

    async def test_tenant_header_spoofing_denied(self, client, db_session):
        """User cannot spoof X-Tenant-ID to access a tenant they don't belong to."""
        tenants = await _setup_two_tenants(db_session)
        alpha, beta = tenants[0], tenants[1]

        # Alpha user sends request with Beta's tenant ID
        spoofed_headers = {
            "Authorization": alpha["headers"]["Authorization"],
            "X-Tenant-ID": str(beta["tenant"].id),
        }
        res = await client.get(f"{API}/classrooms/", headers=spoofed_headers)
        # Should fail — Alpha user has no membership/role in Beta
        assert res.status_code == 403

    async def test_unauthenticated_access_denied(self, client, db_session):
        """Protected endpoints reject requests without Authorization header.

        Tenant-scoped endpoints may return 400 (missing X-Tenant-ID) before
        reaching auth checks — this is still a valid denial of access.
        """
        endpoints = [
            ("GET", f"{API}/classrooms/"),
            ("GET", f"{API}/students/"),
            ("GET", f"{API}/programs/"),
            ("GET", f"{API}/auth/me"),
            ("POST", f"{API}/auth/logout"),
        ]
        for method, path in endpoints:
            res = await getattr(client, method.lower())(path)
            assert res.status_code in (400, 401, 403, 422), \
                f"{method} {path} returned {res.status_code}, expected 400/401/403/422"
            assert res.status_code != 200, f"{method} {path} should not return 200"

    async def test_student_cannot_access_admin_endpoints(self, client, db_session):
        """Student tokens cannot perform admin actions."""
        from app.students.models import Student, StudentMembership
        from app.tenants.models import Tenant
        from app.roles.models import Role

        tenant = Tenant(
            id=uuid4(), name="Student Perm Test", slug="stu-perm",
            code="STUPERM", type="center", is_active=True,
        )
        db_session.add(tenant)
        await db_session.flush()

        db_session.add(Role(
            id=uuid4(), tenant_id=tenant.id, name="Student",
            slug="student", is_system=True, is_active=True,
        ))
        await db_session.flush()

        student = Student(
            id=uuid4(), first_name="Restricted", last_name="Student",
            password_hash=hash_password("Student123!"),
            global_account=False, is_active=True,
        )
        db_session.add(student)
        await db_session.flush()

        db_session.add(StudentMembership(
            id=uuid4(), student_id=student.id, tenant_id=tenant.id,
            username="restricted_stu", role="student", is_active=True,
        ))
        await db_session.flush()

        student_token = create_access_token(
            sub=student.id, sub_type="student",
            tenant_id=tenant.id, role="student",
        )
        headers = {
            "Authorization": f"Bearer {student_token}",
            "X-Tenant-ID": str(tenant.id),
        }

        # Students cannot create classrooms
        res = await client.post(f"{API}/classrooms/", json={
            "name": "Hack", "mode": "online",
        }, headers=headers)
        assert res.status_code == 403

        # Students cannot create other students
        res = await client.post(f"{API}/students/", json={
            "first_name": "Hack", "last_name": "Student",
            "username": "hack", "password": "Hacking123!",
        }, headers=headers)
        assert res.status_code == 403

    async def test_impersonation_requires_super_admin(self, client, db_session):
        """Non-super-admin users cannot impersonate others."""
        from app.users.models import User

        regular = User(
            id=uuid4(), email="regular_imp@example.com",
            password_hash=hash_password("RegPass123!"),
            first_name="Regular", last_name="User",
            is_active=True, is_super_admin=False,
        )
        db_session.add(regular)
        await db_session.flush()

        token = create_access_token(
            sub=regular.id, sub_type="user",
            extra_claims={"is_super_admin": False},
        )
        res = await client.post(f"{API}/auth/impersonate", json={
            "user_id": str(uuid4()),
            "tenant_id": str(uuid4()),
        }, headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 403


# ===================================================================
# A02:2021 — Cryptographic Failures
# ===================================================================


@pytest.mark.asyncio
class TestA02CryptographicFailures:
    """Password hashing, token integrity, sensitive data exposure."""

    async def test_password_not_returned_in_responses(self, client, db_session):
        """Registration and profile endpoints never return password hashes."""
        reg = await client.post(f"{API}/auth/register", json={
            "email": "crypto_test@example.com",
            "password": "CryptoPass123!",
            "first_name": "Crypto",
            "last_name": "Test",
        })
        assert reg.status_code == 200
        body = reg.json()
        assert "password" not in body
        assert "password_hash" not in body
        full = json.dumps(body)
        assert "CryptoPass123!" not in full

        me = await client.get(f"{API}/auth/me", headers={
            "Authorization": f"Bearer {body['access_token']}",
        })
        assert me.status_code == 200
        profile = me.json()
        assert "password" not in profile
        assert "password_hash" not in profile

    async def test_jwt_uses_hs256_with_server_secret(self, client, db_session):
        """Tokens are HS256 and cannot be decoded with a wrong secret."""
        from jose import jwt as jose_jwt, JWTError

        reg = await client.post(f"{API}/auth/register", json={
            "email": "jwt_test@example.com",
            "password": "JwtTest123!",
            "first_name": "Jwt",
            "last_name": "Test",
        })
        token = reg.json()["access_token"]

        # Decode header to verify algorithm
        header = json.loads(
            base64.urlsafe_b64decode(token.split(".")[0] + "==")
        )
        assert header["alg"] == "HS256"

        # Cannot decode with wrong secret
        with pytest.raises(JWTError):
            jose_jwt.decode(token, "wrong-secret-key", algorithms=["HS256"])

    async def test_jwt_contains_required_claims(self, client, db_session):
        """Access tokens contain sub, type, jti, exp, iat."""
        from app.core.security import decode_token

        reg = await client.post(f"{API}/auth/register", json={
            "email": "claims_test@example.com",
            "password": "ClaimsTest123!",
            "first_name": "Claims",
            "last_name": "Test",
        })
        token = reg.json()["access_token"]
        payload = decode_token(token)
        assert payload["type"] == "access"
        assert "sub" in payload
        assert "jti" in payload
        assert "exp" in payload
        assert "iat" in payload
        assert payload["sub_type"] == "user"

    async def test_different_passwords_produce_different_hashes(self, client, db_session):
        """Bcrypt produces unique salted hashes."""
        h1 = hash_password("Password123!")
        h2 = hash_password("Password123!")
        assert h1 != h2  # bcrypt uses random salts

    async def test_tokens_are_unique_per_login(self, client, db_session):
        """Each login produces different tokens (unique JTI)."""
        await client.post(f"{API}/auth/register", json={
            "email": "unique_tok@example.com",
            "password": "UniquePass123!",
            "first_name": "Unique",
            "last_name": "Tok",
        })
        login1 = await client.post(f"{API}/auth/login", json={
            "email": "unique_tok@example.com",
            "password": "UniquePass123!",
        })
        login2 = await client.post(f"{API}/auth/login", json={
            "email": "unique_tok@example.com",
            "password": "UniquePass123!",
        })
        assert login1.json()["access_token"] != login2.json()["access_token"]
        assert login1.json()["refresh_token"] != login2.json()["refresh_token"]


# ===================================================================
# A03:2021 — Injection
# ===================================================================


@pytest.mark.asyncio
class TestA03Injection:
    """SQL injection, header injection, path traversal attempts."""

    async def test_sql_injection_in_login_email(self, client, db_session):
        """SQL injection in email field is rejected by validation or returns 401."""
        payloads = [
            "' OR 1=1 --",
            "admin@example.com' OR '1'='1",
            "'; DROP TABLE users; --",
            "admin@example.com\"; DROP TABLE users;--",
        ]
        for payload in payloads:
            res = await client.post(f"{API}/auth/login", json={
                "email": payload,
                "password": "anything",
            })
            # Should fail validation (422) or auth (401), never 200 or 500
            assert res.status_code in (401, 422), \
                f"SQLi payload '{payload}' returned {res.status_code}"

    async def test_sql_injection_in_student_username(self, client, db_session):
        """SQL injection in student login username field."""
        from app.tenants.models import Tenant
        from app.roles.models import Role

        tenant = Tenant(
            id=uuid4(), name="SQLi Test", slug="sqli-test",
            code="SQLI01", type="center", is_active=True,
        )
        db_session.add(tenant)
        await db_session.flush()
        db_session.add(Role(
            id=uuid4(), tenant_id=tenant.id, name="Student",
            slug="student", is_system=True, is_active=True,
        ))
        await db_session.flush()

        payloads = [
            "' OR 1=1 --",
            "admin'; DROP TABLE students; --",
            "' UNION SELECT * FROM users --",
        ]
        for payload in payloads:
            res = await client.post(f"{API}/auth/student-login", json={
                "username": payload,
                "password": "anything",
                "tenant_slug": "sqli-test",
            })
            assert res.status_code in (401, 404, 422), \
                f"SQLi payload '{payload}' returned {res.status_code}"

    async def test_sql_injection_in_tenant_resolve(self, client, db_session):
        """SQL injection in public tenant resolution endpoint."""
        payloads = [
            "' OR 1=1 --",
            "'; DROP TABLE tenants;--",
            "test' UNION SELECT id,email,password_hash,1,1 FROM users--",
        ]
        for payload in payloads:
            res = await client.get(f"{API}/auth/tenants/resolve/{payload}")
            assert res.status_code in (404, 422), \
                f"SQLi payload returned {res.status_code}"

    async def test_nosql_injection_in_json_body(self, client, db_session):
        """NoSQL-style injection payloads in JSON bodies are rejected."""
        res = await client.post(f"{API}/auth/login", json={
            "email": {"$gt": ""},
            "password": {"$ne": ""},
        })
        assert res.status_code == 422

    async def test_header_injection_in_tenant_id(self, client, db_session):
        """Malicious X-Tenant-ID header values don't cause server errors."""
        from app.users.models import User

        user = User(
            id=uuid4(), email="header_inj@example.com",
            password_hash=hash_password("HdrInj123!"),
            first_name="Header", last_name="Inj",
            is_active=True, is_super_admin=False,
        )
        db_session.add(user)
        await db_session.flush()

        token = create_access_token(sub=user.id, sub_type="user")
        auth = {"Authorization": f"Bearer {token}"}

        payloads = [
            "not-a-uuid",
            "'; DROP TABLE tenants;--",
            "<script>alert(1)</script>",
            "../../../etc/passwd",
            "00000000-0000-0000-0000-000000000000",
        ]
        for payload in payloads:
            res = await client.get(f"{API}/classrooms/", headers={
                **auth, "X-Tenant-ID": payload,
            })
            assert res.status_code in (400, 403, 404, 422), \
                f"Header payload '{payload}' returned {res.status_code}"

    async def test_path_traversal_in_uuid_params(self, client, db_session):
        """Path traversal or invalid UUIDs in path params don't crash the server."""
        tenants = await _setup_two_tenants(db_session)
        headers = tenants[0]["headers"]

        traversal_payloads = [
            "../../../etc/passwd",
            "..%2F..%2F..%2Fetc%2Fpasswd",
            "00000000-0000-0000-0000-000000000000",
            "not-a-uuid",
        ]
        for payload in traversal_payloads:
            res = await client.get(
                f"{API}/classrooms/{payload}", headers=headers,
            )
            assert res.status_code in (404, 422), \
                f"Traversal payload '{payload}' returned {res.status_code}"


# ===================================================================
# A04:2021 — Insecure Design
# ===================================================================


@pytest.mark.asyncio
class TestA04InsecureDesign:
    """Mass assignment, business logic bypass, enumeration."""

    async def test_mass_assignment_cannot_escalate_to_super_admin(self, client, db_session):
        """Registration cannot set is_super_admin via extra fields."""
        res = await client.post(f"{API}/auth/register", json={
            "email": "mass_assign@example.com",
            "password": "MassAssign123!",
            "first_name": "Mass",
            "last_name": "Assign",
            "is_super_admin": True,
            "is_active": True,
        })
        assert res.status_code == 200
        token = res.json()["access_token"]

        me = await client.get(f"{API}/auth/me", headers={
            "Authorization": f"Bearer {token}",
        })
        assert me.status_code == 200
        assert me.json()["is_super_admin"] is False

    async def test_mass_assignment_cannot_set_tenant_id_on_student(self, client, db_session):
        """Student creation cannot override tenant_id via extra fields."""
        tenants = await _setup_two_tenants(db_session)
        alpha, beta = tenants[0], tenants[1]

        res = await client.post(f"{API}/students/", json={
            "first_name": "Sneaky",
            "last_name": "Student",
            "username": "sneaky_stu",
            "password": "Sneaky123!",
            "tenant_id": str(beta["tenant"].id),
        }, headers=alpha["headers"])
        # Should create in Alpha's tenant, not Beta's
        assert res.status_code == 201

        res = await client.get(f"{API}/students/", headers=alpha["headers"])
        assert any(s["first_name"] == "Sneaky" for s in res.json())

        # Beta should NOT see the student
        res = await client.get(f"{API}/students/", headers=beta["headers"])
        assert not any(s["first_name"] == "Sneaky" for s in res.json())

    async def test_duplicate_email_registration_rejected(self, client, db_session):
        """Registering with the same email twice is rejected."""
        await client.post(f"{API}/auth/register", json={
            "email": "dupe_reg@example.com",
            "password": "DupeReg123!",
            "first_name": "Dupe",
            "last_name": "One",
        })
        res = await client.post(f"{API}/auth/register", json={
            "email": "dupe_reg@example.com",
            "password": "DupeReg456!",
            "first_name": "Dupe",
            "last_name": "Two",
        })
        assert res.status_code == 400
        assert "already registered" in res.json()["detail"].lower()

    async def test_error_responses_do_not_leak_internals(self, client, db_session):
        """Error responses do not expose stack traces, SQL queries, or table names."""
        res = await client.post(f"{API}/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "WrongPass123!",
        })
        assert res.status_code == 401
        body = json.dumps(res.json()).lower()
        assert "traceback" not in body
        assert "sqlalchemy" not in body
        assert "select" not in body
        assert "password_hash" not in body

    async def test_login_error_does_not_reveal_email_existence(self, client, db_session):
        """Login with wrong email and wrong password produce the same error message."""
        await client.post(f"{API}/auth/register", json={
            "email": "exists_check@example.com",
            "password": "ExistsCheck123!",
            "first_name": "Exists",
            "last_name": "Check",
        })

        # Wrong email
        res1 = await client.post(f"{API}/auth/login", json={
            "email": "nope@example.com",
            "password": "anything123!",
        })
        # Correct email, wrong password
        res2 = await client.post(f"{API}/auth/login", json={
            "email": "exists_check@example.com",
            "password": "WrongPassword123!",
        })

        assert res1.status_code == res2.status_code == 401
        assert res1.json()["detail"] == res2.json()["detail"]

    async def test_password_minimum_length_enforced(self, client, db_session):
        """Registration rejects passwords shorter than 8 characters."""
        res = await client.post(f"{API}/auth/register", json={
            "email": "short_pw@example.com",
            "password": "Short1!",
            "first_name": "Short",
            "last_name": "Pw",
        })
        assert res.status_code == 422


# ===================================================================
# A05:2021 — Security Misconfiguration
# ===================================================================


@pytest.mark.asyncio
class TestA05SecurityMisconfiguration:
    """CORS, debug endpoints, OpenAPI exposure."""

    async def test_health_endpoint_does_not_leak_config(self, client, db_session):
        """Health endpoint does not expose database URLs or secrets."""
        res = await client.get("/health")
        assert res.status_code == 200
        body = json.dumps(res.json()).lower()
        assert "postgresql" not in body
        assert "redis://" not in body
        assert "secret" not in body
        assert "password" not in body

    async def test_nonexistent_routes_return_404_not_500(self, client, db_session):
        """Unknown routes return clean 404, not 500 with stack traces."""
        paths = [
            f"{API}/admin/drop-database",
            f"{API}/debug/shell",
            f"{API}/../../../etc/passwd",
            f"{API}/classrooms/../../admin/stats",
        ]
        for path in paths:
            res = await client.get(path)
            assert res.status_code in (404, 405, 307), \
                f"Path '{path}' returned {res.status_code}"


# ===================================================================
# A07:2021 — Identification and Authentication Failures
# ===================================================================


@pytest.mark.asyncio
class TestA07AuthenticationFailures:
    """Token reuse after revocation, session management, credential handling."""

    async def test_revoked_access_token_rejected(self, client, db_session):
        """After logout, the access token is rejected by /me."""
        reg = await client.post(f"{API}/auth/register", json={
            "email": "revoked_test@example.com",
            "password": "RevokedPass123!",
            "first_name": "Revoked",
            "last_name": "Test",
        })
        tokens = reg.json()
        access = tokens["access_token"]
        refresh = tokens["refresh_token"]

        # Logout
        await client.post(f"{API}/auth/logout", json={
            "refresh_token": refresh,
        }, headers={"Authorization": f"Bearer {access}"})

        # Access token should now be revoked
        me = await client.get(f"{API}/auth/me", headers={
            "Authorization": f"Bearer {access}",
        })
        assert me.status_code == 401

    async def test_revoked_refresh_token_cannot_be_reused(self, client, db_session):
        """Refresh token used for refresh cannot be used again (rotation)."""
        reg = await client.post(f"{API}/auth/register", json={
            "email": "refresh_reuse@example.com",
            "password": "RefreshReuse123!",
            "first_name": "Refresh",
            "last_name": "Reuse",
        })
        refresh = reg.json()["refresh_token"]

        # First refresh succeeds
        res1 = await client.post(f"{API}/auth/refresh", json={
            "refresh_token": refresh,
        })
        assert res1.status_code == 200

        # Second use of same refresh token should fail (revoked after first use)
        res2 = await client.post(f"{API}/auth/refresh", json={
            "refresh_token": refresh,
        })
        assert res2.status_code == 401

    async def test_logout_all_revokes_every_session(self, client, db_session):
        """logout-all invalidates tokens from all devices."""
        # Register and login from two "devices"
        await client.post(f"{API}/auth/register", json={
            "email": "multidevice@example.com",
            "password": "MultiDev123!",
            "first_name": "Multi",
            "last_name": "Device",
        })
        login1 = await client.post(f"{API}/auth/login", json={
            "email": "multidevice@example.com",
            "password": "MultiDev123!",
        })
        login2 = await client.post(f"{API}/auth/login", json={
            "email": "multidevice@example.com",
            "password": "MultiDev123!",
        })
        token1 = login1.json()["access_token"]
        refresh1 = login1.json()["refresh_token"]
        refresh2 = login2.json()["refresh_token"]

        # Logout all from device 1
        res = await client.post(f"{API}/auth/logout-all", headers={
            "Authorization": f"Bearer {token1}",
        })
        assert res.status_code == 200
        assert res.json()["revoked_count"] >= 2

        # Refresh from device 2 should fail
        res = await client.post(f"{API}/auth/refresh", json={
            "refresh_token": refresh2,
        })
        assert res.status_code == 401

    async def test_forged_jwt_rejected(self, client, db_session):
        """JWT signed with a different secret is rejected."""
        from jose import jwt as jose_jwt

        payload = {
            "sub": str(uuid4()),
            "sub_type": "user",
            "jti": uuid4().hex,
            "type": "access",
            "is_super_admin": True,
        }
        forged = jose_jwt.encode(payload, "attacker-secret", algorithm="HS256")
        res = await client.get(f"{API}/auth/me", headers={
            "Authorization": f"Bearer {forged}",
        })
        assert res.status_code == 401

    async def test_none_algorithm_attack_rejected(self, client, db_session):
        """JWT with 'none' algorithm is rejected."""
        # Manually craft a token with alg: none
        header = base64.urlsafe_b64encode(
            json.dumps({"alg": "none", "typ": "JWT"}).encode()
        ).rstrip(b"=").decode()
        payload_data = {
            "sub": str(uuid4()),
            "sub_type": "user",
            "type": "access",
            "is_super_admin": True,
        }
        payload = base64.urlsafe_b64encode(
            json.dumps(payload_data).encode()
        ).rstrip(b"=").decode()
        none_token = f"{header}.{payload}."

        res = await client.get(f"{API}/auth/me", headers={
            "Authorization": f"Bearer {none_token}",
        })
        assert res.status_code == 401

    async def test_expired_token_rejected(self, client, db_session):
        """Expired JWT tokens are rejected."""
        from jose import jwt as jose_jwt
        from datetime import datetime, timedelta, timezone
        from app.config import settings

        payload = {
            "sub": str(uuid4()),
            "sub_type": "user",
            "jti": uuid4().hex,
            "iat": datetime.now(timezone.utc) - timedelta(hours=2),
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            "type": "access",
        }
        expired = jose_jwt.encode(
            payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM,
        )
        res = await client.get(f"{API}/auth/me", headers={
            "Authorization": f"Bearer {expired}",
        })
        assert res.status_code == 401

    async def test_refresh_token_cannot_be_used_as_access_token(self, client, db_session):
        """Refresh tokens cannot authenticate API requests."""
        reg = await client.post(f"{API}/auth/register", json={
            "email": "wrong_type@example.com",
            "password": "WrongType123!",
            "first_name": "Wrong",
            "last_name": "Type",
        })
        refresh = reg.json()["refresh_token"]

        res = await client.get(f"{API}/auth/me", headers={
            "Authorization": f"Bearer {refresh}",
        })
        assert res.status_code == 401

    async def test_access_token_cannot_be_used_as_refresh(self, client, db_session):
        """Access tokens cannot be used to refresh."""
        reg = await client.post(f"{API}/auth/register", json={
            "email": "access_as_ref@example.com",
            "password": "AccessRef123!",
            "first_name": "Access",
            "last_name": "Ref",
        })
        access = reg.json()["access_token"]

        res = await client.post(f"{API}/auth/refresh", json={
            "refresh_token": access,
        })
        assert res.status_code == 401

    async def test_deactivated_user_cannot_refresh(self, client, db_session):
        """If a user is deactivated, refresh should fail."""
        from app.users.models import User

        user = User(
            id=uuid4(), email="deactivated@example.com",
            password_hash=hash_password("Deactivated123!"),
            first_name="Deactivated", last_name="User",
            is_active=True, is_super_admin=False,
        )
        db_session.add(user)
        await db_session.flush()

        # Login while active
        login_res = await client.post(f"{API}/auth/login", json={
            "email": "deactivated@example.com",
            "password": "Deactivated123!",
        })
        assert login_res.status_code == 200
        refresh = login_res.json()["refresh_token"]

        # Deactivate user
        user.is_active = False
        await db_session.flush()

        # Try to refresh
        res = await client.post(f"{API}/auth/refresh", json={
            "refresh_token": refresh,
        })
        assert res.status_code == 401


# ===================================================================
# A08:2021 — Software and Data Integrity Failures
# ===================================================================


@pytest.mark.asyncio
class TestA08IntegrityFailures:
    """Token tampering, payload modification."""

    async def test_tampered_jwt_payload_rejected(self, client, db_session):
        """Modifying JWT payload without re-signing is rejected."""
        reg = await client.post(f"{API}/auth/register", json={
            "email": "tamper_test@example.com",
            "password": "TamperTest123!",
            "first_name": "Tamper",
            "last_name": "Test",
        })
        token = reg.json()["access_token"]
        parts = token.split(".")

        # Decode payload, modify is_super_admin, re-encode
        payload_bytes = base64.urlsafe_b64decode(parts[1] + "==")
        payload = json.loads(payload_bytes)
        payload["is_super_admin"] = True
        modified_payload = base64.urlsafe_b64encode(
            json.dumps(payload).encode()
        ).rstrip(b"=").decode()
        tampered = f"{parts[0]}.{modified_payload}.{parts[2]}"

        res = await client.get(f"{API}/auth/me", headers={
            "Authorization": f"Bearer {tampered}",
        })
        assert res.status_code == 401


# ===================================================================
# A09:2021 — Security Logging and Monitoring Failures
# ===================================================================


@pytest.mark.asyncio
class TestA09SecurityLogging:
    """Verify that failed auth attempts don't leak sensitive data in responses."""

    async def test_failed_login_returns_generic_error(self, client, db_session):
        """Failed logins return generic messages, not user-specific hints."""
        res = await client.post(f"{API}/auth/login", json={
            "email": "nobody@example.com",
            "password": "wrong",
        })
        assert res.status_code == 401
        detail = res.json()["detail"].lower()
        assert "invalid" in detail
        # Should NOT say "user not found" or "wrong password" specifically
        assert "not found" not in detail
        assert "wrong password" not in detail

    async def test_student_login_failure_generic_message(self, client, db_session):
        """Failed student login returns generic error."""
        from app.tenants.models import Tenant
        from app.roles.models import Role

        tenant = Tenant(
            id=uuid4(), name="Log Test", slug="log-test",
            code="LOG001", type="center", is_active=True,
        )
        db_session.add(tenant)
        await db_session.flush()
        db_session.add(Role(
            id=uuid4(), tenant_id=tenant.id, name="Student",
            slug="student", is_system=True, is_active=True,
        ))
        await db_session.flush()

        res = await client.post(f"{API}/auth/student-login", json={
            "username": "nonexistent_stu",
            "password": "anything",
            "tenant_slug": "log-test",
        })
        assert res.status_code == 401
        detail = res.json()["detail"].lower()
        assert "invalid" in detail


# ===================================================================
# A10:2021 — Server-Side Request Forgery (SSRF)
# ===================================================================


@pytest.mark.asyncio
class TestA10SSRF:
    """Verify that user-supplied URLs don't trigger internal requests."""

    async def test_meeting_link_stored_as_string_not_fetched(self, client, db_session):
        """Meeting links are stored verbatim, not fetched server-side."""
        tenants = await _setup_two_tenants(db_session)
        headers = tenants[0]["headers"]

        # Internal URL as meeting link — should be stored, not fetched
        res = await client.post(f"{API}/classrooms/", json={
            "name": "SSRF Test Class",
            "mode": "online",
            "meeting_link": "http://169.254.169.254/latest/meta-data/",
        }, headers=headers)
        assert res.status_code == 201
        assert res.json()["meeting_link"] == "http://169.254.169.254/latest/meta-data/"
