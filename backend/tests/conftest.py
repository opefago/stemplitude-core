"""Shared pytest fixtures available to both unit and integration tests."""

import os
from typing import Any
from uuid import uuid4

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")

from app.core.security import create_access_token, hash_password
from app.users.models import User


def make_user(**overrides) -> User:
    """Factory helper for User instances with sensible defaults."""
    defaults = dict(
        id=uuid4(),
        email="testuser@example.com",
        password_hash=hash_password("TestPassword123!"),
        first_name="Test",
        last_name="User",
        is_active=True,
        is_super_admin=False,
    )
    defaults.update(overrides)
    return User(**defaults)


def make_super_admin(**overrides) -> User:
    return make_user(
        email="admin@example.com",
        password_hash=hash_password("AdminPassword123!"),
        first_name="Super",
        last_name="Admin",
        is_super_admin=True,
        **overrides,
    )


def get_auth_token(user: User, tenant_id: str | None = None) -> str:
    """Create an access token for testing."""
    from uuid import UUID

    tid = UUID(tenant_id) if tenant_id and isinstance(tenant_id, str) else tenant_id
    return create_access_token(
        sub=user.id,
        sub_type="user",
        tenant_id=tid,
        extra_claims={"is_super_admin": user.is_super_admin},
    )


def pytest_configure(config: Any) -> None:
    config.addinivalue_line("markers", "unit: Fast tests with mocked dependencies")
    config.addinivalue_line("markers", "integration: Tests with real Postgres/Redis containers")
