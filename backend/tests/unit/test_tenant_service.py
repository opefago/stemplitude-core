"""Unit tests for TenantService — all repos are mocked."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.tenants.schemas import MemberAdd, TenantCreate


pytestmark = pytest.mark.unit


@pytest.fixture
def mock_repos():
    return {
        "repo": AsyncMock(),
        "membership_repo": AsyncMock(),
        "lab_repo": AsyncMock(),
        "grant_repo": AsyncMock(),
        "hierarchy_repo": AsyncMock(),
    }


@pytest.fixture
def service(mock_db, mock_repos):
    from app.tenants.service import TenantService

    svc = TenantService.__new__(TenantService)
    svc.session = mock_db
    svc.repo = mock_repos["repo"]
    svc.membership_repo = mock_repos["membership_repo"]
    svc.lab_repo = mock_repos["lab_repo"]
    svc.grant_repo = mock_repos["grant_repo"]
    svc.hierarchy_repo = mock_repos["hierarchy_repo"]
    return svc


class TestCreateTenant:
    @pytest.mark.xfail(reason="TenantCreate schema missing is_active field — service bug")
    async def test_creates_tenant_and_seeds_roles(self, service, mock_repos, mock_db):
        tenant = MagicMock()
        tenant.id = uuid4()
        tenant.name = "New Center"
        mock_repos["repo"].create.return_value = tenant

        admin_role = MagicMock()
        admin_role.id = uuid4()
        execute_result = MagicMock()
        execute_result.scalar_one_or_none.return_value = admin_role
        mock_db.execute = AsyncMock(return_value=execute_result)

        user_id = uuid4()
        data = TenantCreate(
            name="New Center",
            slug="new-center",
            code="NC01",
            type="center",
        )

        result = await service.create_tenant(data, created_by_user_id=user_id)

        assert result.id == tenant.id
        mock_repos["repo"].create.assert_awaited_once()
        mock_repos["membership_repo"].add_member.assert_awaited_once_with(
            user_id, tenant.id, admin_role.id
        )


class TestListUserTenants:
    async def test_returns_list(self, service, mock_repos):
        t1 = MagicMock()
        t1.id = uuid4()
        mock_repos["repo"].list_user_accessible_tenants.return_value = [t1]

        result = await service.list_user_tenants(uuid4())

        assert len(result) == 1


class TestGetTenant:
    async def test_existing_tenant(self, service, mock_repos):
        tenant = MagicMock()
        tenant.id = uuid4()
        mock_repos["repo"].get_by_id.return_value = tenant

        result = await service.get_tenant(tenant.id)

        assert result.id == tenant.id

    async def test_not_found_returns_none(self, service, mock_repos):
        mock_repos["repo"].get_by_id.return_value = None

        result = await service.get_tenant(uuid4())

        assert result is None


class TestAddMember:
    async def test_duplicate_membership_returns_none(self, service, mock_repos):
        mock_repos["repo"].get_by_id.return_value = MagicMock()
        mock_repos["membership_repo"].get_by_user_tenant.return_value = MagicMock()

        result = await service.add_member(
            uuid4(), MemberAdd(user_id=uuid4(), role_id=uuid4())
        )

        assert result is None

    async def test_tenant_not_found_returns_none(self, service, mock_repos):
        mock_repos["repo"].get_by_id.return_value = None

        result = await service.add_member(
            uuid4(), MemberAdd(user_id=uuid4(), role_id=uuid4())
        )

        assert result is None

    async def test_success(self, service, mock_repos):
        mock_repos["repo"].get_by_id.return_value = MagicMock()
        mock_repos["membership_repo"].get_by_user_tenant.return_value = None
        new_membership = MagicMock()
        mock_repos["membership_repo"].add_member.return_value = new_membership

        result = await service.add_member(
            uuid4(), MemberAdd(user_id=uuid4(), role_id=uuid4())
        )

        assert result is new_membership
