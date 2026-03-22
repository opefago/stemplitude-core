"""Unit tests for RoleService — repository is mocked."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.roles.schemas import RoleCreate, RoleUpdate
from app.roles.service import RoleService


pytestmark = pytest.mark.unit


@pytest.fixture
def mock_repo():
    return AsyncMock()


@pytest.fixture
def service(mock_db, mock_repo):
    svc = RoleService.__new__(RoleService)
    svc.session = mock_db
    svc.repo = mock_repo
    return svc


class TestListRoles:
    async def test_returns_roles(self, service, mock_repo):
        roles = [MagicMock(), MagicMock()]
        mock_repo.list_roles.return_value = roles

        result = await service.list_roles(uuid4())

        assert len(result) == 2


class TestCreateRole:
    async def test_success(self, service, mock_repo):
        mock_repo.get_role_by_slug.return_value = None
        new_role = MagicMock()
        new_role.id = uuid4()
        new_role.name = "TA"
        new_role.slug = "ta"
        mock_repo.create_role.return_value = new_role

        result = await service.create_role(
            uuid4(), RoleCreate(name="TA", slug="ta")
        )

        assert result.id == new_role.id
        mock_repo.create_role.assert_awaited_once()

    async def test_duplicate_slug_raises_409(self, service, mock_repo):
        mock_repo.get_role_by_slug.return_value = MagicMock()

        with pytest.raises(HTTPException) as exc_info:
            await service.create_role(
                uuid4(), RoleCreate(name="Dup", slug="dup")
            )
        assert exc_info.value.status_code == 409


class TestUpdateRole:
    async def test_system_role_cannot_be_modified(self, service, mock_repo):
        role = MagicMock()
        role.id = uuid4()
        role.is_system = True
        role.tenant_id = uuid4()
        mock_repo.get_role_by_id.return_value = role

        with pytest.raises(HTTPException) as exc_info:
            await service.update_role(
                role.id, role.tenant_id, RoleUpdate(name="Changed")
            )
        assert exc_info.value.status_code == 400

    async def test_not_found_raises(self, service, mock_repo):
        mock_repo.get_role_by_id.return_value = None

        with pytest.raises(HTTPException) as exc_info:
            await service.update_role(
                uuid4(), uuid4(), RoleUpdate(name="Changed")
            )
        assert exc_info.value.status_code == 404


class TestDeleteRole:
    async def test_system_role_cannot_be_deleted(self, service, mock_repo):
        role = MagicMock()
        role.id = uuid4()
        role.is_system = True
        role.tenant_id = uuid4()
        mock_repo.get_role_by_id.return_value = role

        with pytest.raises(HTTPException) as exc_info:
            await service.delete_role(role.id, role.tenant_id)
        assert exc_info.value.status_code == 400
