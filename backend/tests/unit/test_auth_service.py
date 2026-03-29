"""Unit tests for AuthService — all DB and Redis interactions are mocked."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.auth.schemas import LoginRequest, RegisterRequest, StudentLoginRequest
from app.auth.service import AuthError, AuthService
from app.core.security import hash_password


pytestmark = pytest.mark.unit


@pytest.fixture
def mock_repo():
    return AsyncMock()


@pytest.fixture
def service(mock_db, mock_repo):
    svc = AuthService.__new__(AuthService)
    svc.db = mock_db
    svc.repo = mock_repo
    return svc


# ---------------------------------------------------------------------------
# authenticate_user
# ---------------------------------------------------------------------------


class TestAuthenticateUser:
    async def test_success(self, service, mock_repo, fake_redis):
        user = MagicMock()
        user.id = uuid4()
        user.is_super_admin = False
        user.password_hash = hash_password("correct")
        mock_repo.get_active_user_by_email.return_value = user

        result = await service.authenticate_user(
            LoginRequest(email="a@b.com", password="correct")
        )

        assert result.access_token
        assert result.refresh_token
        mock_repo.get_active_user_by_email.assert_awaited_once_with("a@b.com")

    async def test_unknown_email(self, service, mock_repo):
        mock_repo.get_active_user_by_email.return_value = None

        with pytest.raises(AuthError, match="Invalid email or password"):
            await service.authenticate_user(
                LoginRequest(email="x@y.com", password="pass")
            )

    async def test_bad_password(self, service, mock_repo):
        user = MagicMock()
        user.id = uuid4()
        user.password_hash = hash_password("right")
        mock_repo.get_active_user_by_email.return_value = user

        with pytest.raises(AuthError, match="Invalid email or password"):
            await service.authenticate_user(
                LoginRequest(email="a@b.com", password="wrong")
            )


# ---------------------------------------------------------------------------
# register_user
# ---------------------------------------------------------------------------


class TestRegisterUser:
    async def test_success(self, service, mock_repo, fake_redis):
        mock_repo.get_user_by_email.return_value = None

        created_user = MagicMock()
        created_user.id = uuid4()
        created_user.is_super_admin = False
        mock_repo.create_user.return_value = created_user

        result = await service.register_user(
            RegisterRequest(
                email="new@user.com",
                password="SecureP@ss1",
                first_name="New",
                last_name="User",
            )
        )

        assert result.access_token
        mock_repo.create_user.assert_awaited_once()

    async def test_duplicate_email(self, service, mock_repo):
        mock_repo.get_user_by_email.return_value = MagicMock()

        with pytest.raises(AuthError, match="Email already registered"):
            await service.register_user(
                RegisterRequest(
                    email="dup@user.com",
                    password="SecureP@ss1",
                    first_name="Dup",
                    last_name="User",
                )
            )


# ---------------------------------------------------------------------------
# refresh_token
# ---------------------------------------------------------------------------


class TestRefreshToken:
    async def test_invalid_token(self, service):
        with patch("app.auth.service.decode_token", return_value={}):
            with pytest.raises(AuthError, match="Invalid refresh token"):
                await service.refresh_token("bad-token")

    async def test_revoked_jti(self, service, fake_redis):
        payload = {
            "sub": str(uuid4()),
            "sub_type": "user",
            "jti": "revoked-jti",
            "type": "refresh",
            "exp": 9999999999,
        }
        await fake_redis.set("auth:blacklist:jti:revoked-jti", "1")

        with patch("app.auth.service.decode_token", return_value=payload):
            with pytest.raises(AuthError, match="Token has been revoked"):
                await service.refresh_token("some-token")

    async def test_user_no_longer_active(self, service, mock_repo, fake_redis):
        uid = uuid4()
        payload = {
            "sub": str(uid),
            "sub_type": "user",
            "jti": "good-jti",
            "type": "refresh",
            "exp": 9999999999,
        }
        mock_repo.get_active_user_by_id.return_value = None

        with patch("app.auth.service.decode_token", return_value=payload):
            with pytest.raises(AuthError, match="User no longer active"):
                await service.refresh_token("some-token")


# ---------------------------------------------------------------------------
# logout / logout_all_devices
# ---------------------------------------------------------------------------


class TestLogout:
    async def test_blacklists_both_jtis(self, service, fake_redis):
        access_payload = {"jti": "acc-jti", "exp": 9999999999, "sub": str(uuid4()), "type": "access"}
        refresh_payload = {"jti": "ref-jti", "exp": 9999999999, "sub": str(uuid4()), "sub_type": "user", "type": "refresh"}

        with patch("app.auth.service.decode_token", side_effect=[access_payload, refresh_payload]):
            await service.logout("access-tok", "refresh-tok")

        assert await fake_redis.get("auth:blacklist:jti:acc-jti") == "1"
        assert await fake_redis.get("auth:blacklist:jti:ref-jti") == "1"


class TestLogoutAllDevices:
    async def test_revokes_all_sessions(self, service, fake_redis):
        uid = uuid4()
        key = f"auth:sessions:user:{uid}"
        await fake_redis.sadd(key, "jti-a", "jti-b", "jti-c")

        count = await service.logout_all_devices("user", uid)

        assert count == 3
        assert await fake_redis.get("auth:blacklist:jti:jti-a") == "1"
        assert await fake_redis.get("auth:blacklist:jti:jti-b") == "1"
        assert await fake_redis.get("auth:blacklist:jti:jti-c") == "1"
        assert await fake_redis.scard(key) == 0


# ---------------------------------------------------------------------------
# authenticate_student
# ---------------------------------------------------------------------------


class TestAuthenticateStudentGlobal:
    async def test_success(self, service, mock_repo, fake_redis):
        student = MagicMock()
        student.id = uuid4()
        student.global_account = True
        student.password_hash = hash_password("pass123")
        mock_repo.get_active_global_student_by_email.return_value = student

        result = await service._authenticate_student_global(
            StudentLoginRequest(email="s@school.edu", password="pass123")
        )

        assert result.access_token
        assert result.refresh_token

    async def test_unknown_email(self, service, mock_repo):
        mock_repo.get_active_global_student_by_email.return_value = None

        with pytest.raises(AuthError, match="Invalid email or password"):
            await service._authenticate_student_global(
                StudentLoginRequest(email="bad@school.edu", password="pass")
            )


# ---------------------------------------------------------------------------
# onboard (register + create org)
# ---------------------------------------------------------------------------


class TestOnboard:
    async def test_success(self, service, mock_repo, mock_db, fake_redis, monkeypatch):
        from app.auth.schemas import OnboardRequest, OnboardOrganization
        from app.config import settings

        monkeypatch.setattr(settings, "TRIAL_ENABLED", False)

        mock_repo.get_user_by_email.return_value = None

        created_user = MagicMock()
        created_user.id = uuid4()
        created_user.is_super_admin = False
        mock_repo.create_user.return_value = created_user

        tenant_id = uuid4()

        def assign_id_on_add(obj):
            if hasattr(obj, "id") and obj.id is None:
                obj.id = tenant_id

        mock_db.add.side_effect = assign_id_on_add

        slug_result = MagicMock()
        slug_result.scalar_one_or_none.return_value = None
        owner_role = MagicMock()
        owner_role.id = uuid4()
        owner_role_result = MagicMock()
        owner_role_result.scalar_one.return_value = owner_role
        perms_result = MagicMock()
        perms_result.scalars.return_value.all.return_value = []
        mock_db.execute = AsyncMock(side_effect=[slug_result, owner_role_result, perms_result])

        result = await service.onboard(
            OnboardRequest(
                email="teacher@school.com",
                password="SecureP@ss1",
                first_name="Jane",
                last_name="Doe",
                organization=OnboardOrganization(
                    name="My Academy",
                    slug="my-academy",
                    type="center",
                ),
            )
        )

        assert result.access_token
        assert result.refresh_token
        assert result.tenant_slug == "my-academy"
        assert result.tenant_name == "My Academy"
        assert result.tenant_id == tenant_id
        mock_repo.create_user.assert_awaited_once()

    async def test_duplicate_email_rejected(self, service, mock_repo, monkeypatch):
        from app.auth.schemas import OnboardRequest, OnboardOrganization
        from app.config import settings

        monkeypatch.setattr(settings, "TRIAL_ENABLED", False)

        mock_repo.get_user_by_email.return_value = MagicMock()

        with pytest.raises(AuthError, match="Email already registered"):
            await service.onboard(
                OnboardRequest(
                    email="dup@school.com",
                    password="SecureP@ss1",
                    first_name="Dup",
                    last_name="User",
                    organization=OnboardOrganization(
                        name="Dup Org",
                        slug="dup-org",
                        type="center",
                    ),
                )
            )

    async def test_duplicate_slug_rejected(self, service, mock_repo, mock_db, monkeypatch):
        from app.auth.schemas import OnboardRequest, OnboardOrganization
        from app.config import settings

        monkeypatch.setattr(settings, "TRIAL_ENABLED", False)

        mock_repo.get_user_by_email.return_value = None

        slug_result = MagicMock()
        slug_result.scalar_one_or_none.return_value = MagicMock()
        mock_db.execute = AsyncMock(return_value=slug_result)

        with pytest.raises(AuthError, match="Organization URL is already taken"):
            await service.onboard(
                OnboardRequest(
                    email="new@school.com",
                    password="SecureP@ss1",
                    first_name="New",
                    last_name="User",
                    organization=OnboardOrganization(
                        name="Existing Org",
                        slug="existing-org",
                        type="center",
                    ),
                )
            )


class TestGenerateOrgCode:
    def test_format(self):
        code = AuthService._generate_org_code("robotics-academy")
        assert len(code) == 8
        assert code.isalnum()
        assert code.isupper()

    def test_uniqueness(self):
        codes = {AuthService._generate_org_code("test-org") for _ in range(50)}
        assert len(codes) > 1


class TestAuthenticateStudentTenantScoped:
    async def test_tenant_not_found(self, service, mock_repo):
        mock_repo.resolve_tenant.return_value = None

        with pytest.raises(AuthError, match="Tenant not found"):
            await service._authenticate_student_tenant_scoped(
                StudentLoginRequest(
                    username="kid",
                    tenant_slug="ghost",
                    password="pass",
                )
            )

    async def test_unknown_username(self, service, mock_repo):
        tenant = MagicMock()
        tenant.id = uuid4()
        tenant.slug = "test"
        mock_repo.resolve_tenant.return_value = tenant
        mock_repo.get_tenant_scoped_student.return_value = None

        with pytest.raises(AuthError, match="Invalid username or password"):
            await service._authenticate_student_tenant_scoped(
                StudentLoginRequest(
                    username="ghost",
                    tenant_slug="test",
                    password="pass",
                )
            )
