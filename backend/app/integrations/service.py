"""Integrations service."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import CurrentIdentity, TenantContext

from .providers.base import BaseIntegrationProvider
from .providers.google import GoogleProvider
from .providers.microsoft import MicrosoftProvider
from .providers.zoom import ZoomProvider

from .repository import OAuthConnectionRepository
from .schemas import CalendarSummary, ConnectRedirect, OAuthConnectionResponse, OAuthConnectionUpdate

_PROVIDER_CLASSES: dict[str, type[BaseIntegrationProvider]] = {
    "zoom": ZoomProvider,
    "google": GoogleProvider,
    "microsoft": MicrosoftProvider,
}


class IntegrationService:
    """Integration business logic."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = OAuthConnectionRepository(session)

    def _get_provider(self, provider: str) -> BaseIntegrationProvider | None:
        """Get provider instance. TODO: Load from config/settings."""
        cls = _PROVIDER_CLASSES.get(provider)
        if not cls:
            return None
        # TODO: Load client_id, client_secret from settings or DB
        return cls(client_id="", client_secret="")

    async def list_connections(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext | None,
    ) -> list[OAuthConnectionResponse]:
        """List OAuth connections for user."""
        if identity.sub_type != "user":
            return []
        tenant_id = tenant_ctx.tenant_id if tenant_ctx else None
        connections = await self.repo.list_for_user(identity.id, tenant_id)
        return [OAuthConnectionResponse.model_validate(c) for c in connections]

    async def get_connect_url(
        self,
        provider: str,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext | None,
    ) -> ConnectRedirect | None:
        """Get OAuth authorization URL for connecting provider."""
        if identity.sub_type != "user":
            return None
        prov = self._get_provider(provider)
        if not prov:
            return None
        # TODO: Generate state, store in session/cache, build redirect_uri from APP_URL
        state = f"{identity.id}:{provider}"
        base_url = getattr(settings, "APP_URL", "http://localhost:8000")
        redirect_uri = f"{base_url}/api/v1/integrations/callback/{provider}"
        scopes = []
        url = prov.get_authorization_url(state, redirect_uri, scopes)
        return ConnectRedirect(url=url)

    async def handle_callback(
        self,
        provider: str,
        code: str,
        state: str,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext | None,
    ) -> OAuthConnectionResponse | None:
        """Handle OAuth callback, exchange code, save connection."""
        if identity.sub_type != "user":
            return None
        prov = self._get_provider(provider)
        if not prov:
            return None
        base_url = getattr(settings, "APP_URL", "http://localhost:8000")
        redirect_uri = f"{base_url}/api/v1/integrations/callback/{provider}"
        access_token, refresh_token, expires_in = await prov.exchange_code(code, redirect_uri)
        # TODO: Encrypt tokens before storing
        from datetime import datetime, timezone, timedelta
        token_expires_at = None
        if expires_in:
            token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        tenant_id = tenant_ctx.tenant_id if tenant_ctx else None
        existing = await self.repo.get_by_provider(identity.id, tenant_id, provider)
        if existing:
            await self.repo.update(
                existing,
                access_token_enc=access_token,
                refresh_token_enc=refresh_token,
                token_expires_at=token_expires_at,
            )
            await self.session.refresh(existing)
            return OAuthConnectionResponse.model_validate(existing)
        conn = await self.repo.create(
            user_id=identity.id,
            tenant_id=tenant_id,
            provider=provider,
            access_token_enc=access_token,
            refresh_token_enc=refresh_token,
            token_expires_at=token_expires_at,
        )
        return OAuthConnectionResponse.model_validate(conn)

    async def delete_connection(
        self,
        connection_id: UUID,
        identity: CurrentIdentity,
    ) -> bool:
        """Delete (deactivate) OAuth connection."""
        if identity.sub_type != "user":
            return False
        conn = await self.repo.get_by_id(connection_id, identity.id)
        if not conn:
            return False
        await self.repo.delete(conn)
        return True

    async def update_calendar_settings(
        self,
        connection_id: UUID,
        data: OAuthConnectionUpdate,
        identity: CurrentIdentity,
    ) -> OAuthConnectionResponse | None:
        """Update calendar sync settings for connection."""
        if identity.sub_type != "user":
            return None
        conn = await self.repo.get_by_id(connection_id, identity.id)
        if not conn:
            return None
        update_data = data.model_dump(exclude_unset=True)
        await self.repo.update(conn, **update_data)
        return OAuthConnectionResponse.model_validate(conn)

    async def list_calendars(
        self,
        connection_id: UUID,
        identity: CurrentIdentity,
    ) -> list[CalendarSummary]:
        """List calendars available for a connection."""
        if identity.sub_type != "user":
            return []
        conn = await self.repo.get_by_id(connection_id, identity.id)
        if not conn:
            return []
        # TODO: Call provider API to list calendars
        return []
