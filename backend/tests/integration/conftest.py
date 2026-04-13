"""Integration test fixtures — real PostgreSQL and Redis via testcontainers.

All database sessions (test fixtures + middleware + service layer) share a
single connection with an outer transaction that rolls back after each test,
ensuring full isolation without needing to clean up data.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from uuid import uuid4

import pytest
import pytest_asyncio
import redis.asyncio as aioredis
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer
from testcontainers.redis import RedisContainer

from tests.conftest import get_auth_token, make_super_admin, make_user

_tables_created = False


# ---------------------------------------------------------------------------
# Containers — session-scoped, start once per test run
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def pg_container():
    with PostgresContainer(
        image="postgres:16-alpine",
        username="test",
        password="test",
        dbname="test_stemplitude",
    ) as pg:
        yield pg


@pytest.fixture(scope="session")
def redis_container():
    with RedisContainer(image="redis:7-alpine") as r:
        yield r


@pytest.fixture(scope="session")
def pg_url(pg_container) -> str:
    host = pg_container.get_container_host_ip()
    port = pg_container.get_exposed_port(5432)
    return f"postgresql+asyncpg://test:test@{host}:{port}/test_stemplitude"


@pytest.fixture(scope="session")
def redis_url(redis_container) -> str:
    host = redis_container.get_container_host_ip()
    port = redis_container.get_exposed_port(6379)
    return f"redis://{host}:{port}/0"


# ---------------------------------------------------------------------------
# Per-test engine + table creation (lazy, once)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def engine(pg_url):
    eng = create_async_engine(pg_url, echo=False, poolclass=NullPool)

    global _tables_created
    if not _tables_created:
        from app.database import Base

        import app.users.models  # noqa: F401
        import app.plans.models  # noqa: F401
        import app.tenants.models  # noqa: F401
        import app.roles.models  # noqa: F401
        import app.subscriptions.models  # noqa: F401
        import app.licenses.models  # noqa: F401
        import app.capabilities.models  # noqa: F401
        import app.programs.models  # noqa: F401
        import app.curriculum.models  # noqa: F401
        import app.classrooms.models  # noqa: F401
        import app.students.models  # noqa: F401
        import app.progress.models  # noqa: F401
        import app.labs.models  # noqa: F401
        import app.messaging.models  # noqa: F401
        import app.notifications.models  # noqa: F401
        import app.email.models  # noqa: F401
        import app.assets.models  # noqa: F401
        import app.admin.models  # noqa: F401
        import app.integrations.models  # noqa: F401
        import app.trials.models  # noqa: F401
        import app.lesson_content.models  # noqa: F401

        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        _tables_created = True

    yield eng
    await eng.dispose()


# ---------------------------------------------------------------------------
# Per-test Redis client + patching
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(autouse=True)
async def _patch_redis(redis_url):
    from app.core import redis as redis_module

    client = aioredis.from_url(redis_url, decode_responses=True)
    original = redis_module.redis_client
    redis_module.redis_client = client
    yield
    await client.flushdb()
    redis_module.redis_client = original
    await client.aclose()


# ---------------------------------------------------------------------------
# Shared connection + session factory (visible to middleware and services)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def db_session(engine) -> AsyncGenerator[AsyncSession, None]:
    """Provide a session on a shared connection.

    An outer transaction wraps everything and is rolled back at the end.
    A SAVEPOINT-based approach ensures that any ``session.commit()`` inside
    the application code doesn't actually commit to the outer transaction.
    The middleware and services share the same connection-bound factory.
    """
    from app import database as db_module
    from app.middleware import tenant as tenant_mw
    from app.students import router as students_router

    connection = await engine.connect()
    outer_tx = await connection.begin()

    test_factory = async_sessionmaker(
        bind=connection, expire_on_commit=False,
    )

    originals = {
        "engine": db_module.engine,
        "factory": db_module.async_session_factory,
        "tenant_mw_factory": tenant_mw.async_session_factory,
        "students_factory": students_router.async_session_factory,
    }
    db_module.engine = engine
    db_module.async_session_factory = test_factory
    tenant_mw.async_session_factory = test_factory
    students_router.async_session_factory = test_factory

    session = test_factory()

    # Use nested transaction (savepoint) so service-layer commits
    # don't escape the outer transaction.
    nested = await connection.begin_nested()

    @event.listens_for(session.sync_session, "after_transaction_end")
    def restart_savepoint(sess, transaction):
        nonlocal nested
        if transaction.nested and not transaction._parent.nested:
            nested = connection.sync_connection.begin_nested()

    try:
        yield session
    finally:
        await session.close()
        await outer_tx.rollback()
        await connection.close()
        db_module.engine = originals["engine"]
        db_module.async_session_factory = originals["factory"]
        tenant_mw.async_session_factory = originals["tenant_mw_factory"]
        students_router.async_session_factory = originals["students_factory"]


@pytest_asyncio.fixture(autouse=True)
async def _ensure_trial_evaluation_plan(db_session: AsyncSession) -> None:
    """Default onboard flow provisions a trial subscription; seed the plan row."""
    from sqlalchemy import select

    from app.config import settings
    from app.plans.models import Plan, PlanFeature, PlanLimit

    if not settings.TRIAL_ENABLED:
        return

    result = await db_session.execute(
        select(Plan).where(Plan.slug == settings.TRIAL_PLAN_SLUG_CENTER)
    )
    if result.scalar_one_or_none():
        return

    plan = Plan(
        name="Evaluation trial (center)",
        slug=settings.TRIAL_PLAN_SLUG_CENTER,
        type="center",
        price_monthly=None,
        price_yearly=None,
        trial_days=14,
        is_active=True,
    )
    db_session.add(plan)
    await db_session.flush()
    for feature_key, enabled in (
        ("students_feature", True),
        ("classrooms", True),
        ("projects", True),
    ):
        db_session.add(
            PlanFeature(plan_id=plan.id, feature_key=feature_key, enabled=enabled)
        )
    for limit_key, limit_value in (
        ("max_students", 12),
        ("max_instructors", 2),
        ("max_classrooms", 2),
        ("max_projects", 40),
        ("storage_mb", 1500),
    ):
        db_session.add(
            PlanLimit(plan_id=plan.id, limit_key=limit_key, limit_value=limit_value)
        )
    await db_session.flush()


# ---------------------------------------------------------------------------
# FastAPI test client
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    from app.database import get_db
    from app.main import app

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Data fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def create_test_user(db_session: AsyncSession):
    user = make_user()
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def create_super_admin(db_session: AsyncSession):
    user = make_super_admin()
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def create_test_tenant(db_session: AsyncSession, create_test_user):
    from app.roles.models import Role
    from app.tenants.models import Membership, Tenant

    tenant = Tenant(
        id=uuid4(),
        name="Test Center",
        slug="test-center",
        code="TEST01",
        type="center",
        is_active=True,
    )
    db_session.add(tenant)
    await db_session.flush()

    for slug, name in [
        ("admin", "Administrator"),
        ("instructor", "Instructor"),
        ("student", "Student"),
    ]:
        db_session.add(
            Role(
                id=uuid4(),
                tenant_id=tenant.id,
                name=name,
                slug=slug,
                is_system=True,
                is_active=True,
            )
        )
    await db_session.flush()

    result = await db_session.execute(
        select(Role).where(Role.tenant_id == tenant.id, Role.slug == "admin")
    )
    admin_role = result.scalar_one()

    db_session.add(
        Membership(
            id=uuid4(),
            user_id=create_test_user.id,
            tenant_id=tenant.id,
            role_id=admin_role.id,
            is_active=True,
        )
    )
    await db_session.flush()
    await db_session.refresh(tenant)
    return tenant


@pytest_asyncio.fixture
async def create_test_student(db_session: AsyncSession, create_test_tenant):
    from app.core.security import hash_password
    from app.students.models import Student, StudentMembership

    student = Student(
        id=uuid4(),
        first_name="Test",
        last_name="Student",
        email=None,
        password_hash=hash_password("StudentPass123!"),
        global_account=False,
        is_active=True,
    )
    db_session.add(student)
    await db_session.flush()

    db_session.add(
        StudentMembership(
            id=uuid4(),
            student_id=student.id,
            tenant_id=create_test_tenant.id,
            username="teststudent",
            role="student",
            is_active=True,
        )
    )
    await db_session.flush()
    await db_session.refresh(student)
    return student


# ---------------------------------------------------------------------------
# Auth header helpers
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def auth_headers(create_test_user):
    token = get_auth_token(create_test_user)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def tenant_auth_headers(create_test_user, create_test_tenant):
    token = get_auth_token(create_test_user, str(create_test_tenant.id))
    return {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": str(create_test_tenant.id),
    }


@pytest_asyncio.fixture
async def super_admin_tenant_headers(
    create_super_admin, create_test_tenant, db_session
):
    from app.roles.models import Role
    from app.tenants.models import Membership

    result = await db_session.execute(
        select(Role).where(
            Role.tenant_id == create_test_tenant.id, Role.slug == "admin"
        )
    )
    admin_role = result.scalar_one_or_none()
    if admin_role:
        existing = await db_session.execute(
            select(Membership).where(
                Membership.user_id == create_super_admin.id,
                Membership.tenant_id == create_test_tenant.id,
            )
        )
        if not existing.scalar_one_or_none():
            db_session.add(
                Membership(
                    user_id=create_super_admin.id,
                    tenant_id=create_test_tenant.id,
                    role_id=admin_role.id,
                    is_active=True,
                )
            )
            await db_session.flush()

    token = get_auth_token(create_super_admin, str(create_test_tenant.id))
    return {
        "Authorization": f"Bearer {token}",
        "X-Tenant-ID": str(create_test_tenant.id),
    }


@pytest_asyncio.fixture
async def student_auth_token(create_test_student, create_test_tenant):
    from app.core.security import create_access_token

    return create_access_token(
        sub=create_test_student.id,
        sub_type="student",
        tenant_id=create_test_tenant.id,
        role="student",
        global_account=False,
    )
