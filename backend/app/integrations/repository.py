"""Integrations repository."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.models import OAuthConnection


class OAuthConnectionRepository:
    """Repository for OAuth connection queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, connection_id: UUID, user_id: UUID) -> OAuthConnection | None:
        """Get OAuth connection by ID for user."""
        result = await self.session.execute(
            select(OAuthConnection).where(
                OAuthConnection.id == connection_id,
                OAuthConnection.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_for_user(
        self,
        user_id: UUID,
        tenant_id: UUID | None = None,
    ) -> list[OAuthConnection]:
        """List OAuth connections for user, optionally filtered by tenant."""
        query = select(OAuthConnection).where(
            OAuthConnection.user_id == user_id,
            OAuthConnection.is_active == True,
        )
        if tenant_id is not None:
            query = query.where(OAuthConnection.tenant_id == tenant_id)
        result = await self.session.execute(query.order_by(OAuthConnection.provider))
        return list(result.scalars().all())

    async def get_by_provider(
        self,
        user_id: UUID,
        tenant_id: UUID | None,
        provider: str,
    ) -> OAuthConnection | None:
        """Get connection by user, tenant, and provider."""
        result = await self.session.execute(
            select(OAuthConnection).where(
                OAuthConnection.user_id == user_id,
                OAuthConnection.tenant_id == tenant_id,
                OAuthConnection.provider == provider,
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        *,
        user_id: UUID,
        tenant_id: UUID | None,
        provider: str,
        provider_account_id: str | None = None,
        access_token_enc: str | None = None,
        refresh_token_enc: str | None = None,
        scopes: str | None = None,
        token_expires_at=None,
    ) -> OAuthConnection:
        """Create OAuth connection."""
        conn = OAuthConnection(
            user_id=user_id,
            tenant_id=tenant_id,
            provider=provider,
            provider_account_id=provider_account_id,
            access_token_enc=access_token_enc,
            refresh_token_enc=refresh_token_enc,
            scopes=scopes,
            token_expires_at=token_expires_at,
        )
        self.session.add(conn)
        await self.session.flush()
        await self.session.refresh(conn)
        return conn

    async def update(
        self,
        connection: OAuthConnection,
        *,
        calendar_sync_enabled: bool | None = None,
        calendar_id: str | None = None,
        is_active: bool | None = None,
        access_token_enc: str | None = None,
        refresh_token_enc: str | None = None,
        token_expires_at=None,
    ) -> OAuthConnection:
        """Update OAuth connection."""
        if calendar_sync_enabled is not None:
            connection.calendar_sync_enabled = calendar_sync_enabled
        if calendar_id is not None:
            connection.calendar_id = calendar_id
        if is_active is not None:
            connection.is_active = is_active
        if access_token_enc is not None:
            connection.access_token_enc = access_token_enc
        if refresh_token_enc is not None:
            connection.refresh_token_enc = refresh_token_enc
        if token_expires_at is not None:
            connection.token_expires_at = token_expires_at
        await self.session.flush()
        await self.session.refresh(connection)
        return connection

    async def delete(self, connection: OAuthConnection) -> None:
        """Soft delete (deactivate) connection."""
        connection.is_active = False
        await self.session.flush()
