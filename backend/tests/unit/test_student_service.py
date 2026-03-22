"""Unit tests for StudentService — repository is mocked."""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.students.schemas import StudentCreate, StudentSelfRegister
from app.students.service import StudentService


pytestmark = pytest.mark.unit


@pytest.fixture
def mock_repo():
    return AsyncMock()


@pytest.fixture
def service(mock_db, mock_repo):
    svc = StudentService.__new__(StudentService)
    svc.session = mock_db
    svc.repo = mock_repo
    return svc


class TestCreateStudent:
    async def test_success(self, service, mock_repo):
        mock_repo.username_exists_in_tenant.return_value = False
        student = MagicMock()
        student.id = uuid4()
        mock_repo.create.return_value = student

        result = await service.create_student(
            StudentCreate(
                first_name="Jane",
                last_name="Doe",
                password="Pass123!",
                username="janedoe",
            ),
            tenant_id=uuid4(),
            created_by=uuid4(),
        )

        assert result.id == student.id
        mock_repo.create.assert_awaited_once()
        mock_repo.create_membership.assert_awaited_once()

    async def test_duplicate_username_raises_409(self, service, mock_repo):
        mock_repo.username_exists_in_tenant.return_value = True

        with pytest.raises(HTTPException) as exc_info:
            await service.create_student(
                StudentCreate(
                    first_name="Dup",
                    last_name="User",
                    password="Pass123!",
                    username="dupuser",
                ),
                tenant_id=uuid4(),
                created_by=uuid4(),
            )
        assert exc_info.value.status_code == 409


class TestSelfRegister:
    async def test_success(self, service, mock_repo):
        mock_repo.username_exists_in_tenant.return_value = False
        student = MagicMock()
        student.id = uuid4()
        mock_repo.create.return_value = student

        tenant = MagicMock()
        tenant.id = uuid4()

        result = await service.self_register(
            StudentSelfRegister(
                first_name="Self",
                last_name="Reg",
                password="Pass123!",
                username="selfreg",
                tenant_slug="test",
            ),
            tenant=tenant,
        )

        assert result.id == student.id

    async def test_duplicate_username(self, service, mock_repo):
        mock_repo.username_exists_in_tenant.return_value = True

        tenant = MagicMock()
        tenant.id = uuid4()

        with pytest.raises(HTTPException) as exc_info:
            await service.self_register(
                StudentSelfRegister(
                    first_name="Dup",
                    last_name="Reg",
                    password="Pass123!",
                    username="taken",
                    tenant_slug="test",
                ),
                tenant=tenant,
            )
        assert exc_info.value.status_code == 409


class TestCheckUsername:
    async def test_available_returns_true(self, service, mock_repo):
        mock_repo.username_exists_in_tenant.return_value = False

        result = await service.check_username("free_name", uuid4())

        assert result is True

    async def test_taken_returns_false(self, service, mock_repo):
        mock_repo.username_exists_in_tenant.return_value = True

        result = await service.check_username("taken_name", uuid4())

        assert result is False
