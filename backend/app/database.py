import logging
from collections.abc import AsyncGenerator

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import StaticPool

from app.config import settings

logger = logging.getLogger(__name__)

_engine_kwargs: dict = {}
if "sqlite" in settings.DATABASE_URL:
    _engine_kwargs = {
        "connect_args": {"check_same_thread": False},
        "poolclass": StaticPool,
    }
else:
    _engine_kwargs = {
        "pool_size": 20,
        "max_overflow": 10,
        "pool_pre_ping": True,
    }

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    **_engine_kwargs,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


def _sanitize_setting(val: str) -> str:
    """Escape single quotes for use in SET LOCAL (no parameterized query support)."""
    return val.replace("'", "''")


async def _set_audit_context(session: AsyncSession, request: Request) -> None:
    """Inject app-level context into the Postgres session for audit triggers."""
    identity = getattr(request.state, "current_identity", None)
    tenant = getattr(request.state, "tenant", None)
    client_ip = request.client.host if request.client else None

    if identity:
        uid = _sanitize_setting(str(identity.id))
        await session.execute(text(f"SET LOCAL app.current_user_id = '{uid}'"))
    if tenant:
        tid = _sanitize_setting(str(tenant.tenant_id))
        await session.execute(text(f"SET LOCAL app.current_tenant_id = '{tid}'"))
    if client_ip:
        ip = _sanitize_setting(client_ip)
        await session.execute(text(f"SET LOCAL app.client_ip = '{ip}'"))
    logger.debug(
        "Audit context set user=%s tenant=%s ip=%s",
        identity.id if identity else None,
        tenant.tenant_id if tenant else None,
        client_ip,
    )


async def get_db(request: Request) -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            await _set_audit_context(session, request)
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            logger.warning("DB session rollback", exc_info=True)
            raise
        finally:
            await session.close()
