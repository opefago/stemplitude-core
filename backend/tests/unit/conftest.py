"""Unit test fixtures — everything is mocked, no containers needed."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
import pytest_asyncio
import fakeredis.aioredis

from tests.conftest import make_super_admin, make_user


# ---------------------------------------------------------------------------
# Fake Redis (full async implementation backed by fakeredis)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def fake_redis():
    """Per-test async Redis client backed by fakeredis — supports all Redis ops."""
    client = fakeredis.aioredis.FakeRedis(decode_responses=True)
    yield client
    await client.flushall()
    await client.aclose()


@pytest_asyncio.fixture(autouse=True)
async def _patch_redis(fake_redis):
    """Auto-patch redis_client so every call to get_redis() returns fakeredis."""
    from app.core import redis as redis_module

    original_client = redis_module.redis_client
    redis_module.redis_client = fake_redis
    yield
    redis_module.redis_client = original_client


# ---------------------------------------------------------------------------
# Mock AsyncSession (SQLAlchemy)
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_db() -> AsyncMock:
    """Mock AsyncSession for unit-testing services without a real database."""
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.refresh = AsyncMock()
    session.close = AsyncMock()

    execute_result = AsyncMock()
    execute_result.scalar_one_or_none = MagicMock(return_value=None)
    execute_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    session.execute = AsyncMock(return_value=execute_result)

    return session


# ---------------------------------------------------------------------------
# Pre-built identities for convenience
# ---------------------------------------------------------------------------


@pytest.fixture
def test_user():
    return make_user()


@pytest.fixture
def super_admin():
    return make_super_admin()


@pytest.fixture
def test_user_id(test_user):
    return test_user.id
