"""Integrations service."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import CurrentIdentity, TenantContext

from .providers.base import BaseIntegrationProvider
from .providers.google import GoogleProvider
from .providers.microsoft import MicrosoftProvider
from .providers.youtube import YouTubeProvider
from .providers.zoom import ZoomProvider

from .repository import OAuthConnectionRepository
from .schemas import (
    CalendarSummary,
    ConnectRedirect,
    OAuthConnectionResponse,
    OAuthConnectionUpdate,
    YouTubeVideoListResponse,
)

_PROVIDER_CLASSES: dict[str, type[BaseIntegrationProvider]] = {
    "zoom": ZoomProvider,
    "google": GoogleProvider,
    "microsoft": MicrosoftProvider,
    "youtube": YouTubeProvider,
}


class IntegrationService:
    """Integration business logic."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = OAuthConnectionRepository(session)

    def _oauth_state_token(
        self,
        provider: str,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext | None,
    ) -> str:
        payload = {
            "type": "oauth_state",
            "provider": provider,
            "user_id": str(identity.id),
            "tenant_id": str(tenant_ctx.tenant_id) if tenant_ctx else None,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        }
        return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    def _decode_oauth_state(self, state: str) -> dict | None:
        try:
            payload = jwt.decode(
                state,
                settings.JWT_SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM],
            )
            if payload.get("type") != "oauth_state":
                return None
            return payload
        except JWTError:
            return None

    def _provider_scopes(self, provider: str) -> list[str]:
        if provider == "youtube":
            return [
                "openid",
                "email",
                "profile",
                "https://www.googleapis.com/auth/youtube.readonly",
            ]
        if provider == "google":
            return [
                "openid",
                "email",
                "profile",
                "https://www.googleapis.com/auth/calendar",
            ]
        if provider == "microsoft":
            return ["openid", "User.Read", "Calendars.ReadWrite"]
        if provider == "zoom":
            return ["meeting:write", "meeting:read"]
        return []

    def _provider_credentials(self, provider: str) -> tuple[str, str]:
        if provider == "youtube":
            client_id = settings.YOUTUBE_OAUTH_CLIENT_ID or settings.GOOGLE_OAUTH_CLIENT_ID
            client_secret = settings.YOUTUBE_OAUTH_CLIENT_SECRET or settings.GOOGLE_OAUTH_CLIENT_SECRET
            return client_id, client_secret
        if provider == "google":
            return settings.GOOGLE_OAUTH_CLIENT_ID, settings.GOOGLE_OAUTH_CLIENT_SECRET
        return "", ""

    def _get_provider(self, provider: str) -> BaseIntegrationProvider | None:
        """Get provider instance."""
        cls = _PROVIDER_CLASSES.get(provider)
        if not cls:
            return None
        client_id, client_secret = self._provider_credentials(provider)
        return cls(client_id=client_id, client_secret=client_secret)

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
        state = self._oauth_state_token(provider, identity, tenant_ctx)
        base_url = settings.APP_URL
        redirect_uri = f"{base_url}/api/v1/integrations/callback/{provider}"
        scopes = self._provider_scopes(provider)
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
        base_url = settings.APP_URL
        redirect_uri = f"{base_url}/api/v1/integrations/callback/{provider}"
        access_token, refresh_token, expires_in = await prov.exchange_code(code, redirect_uri)
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

    async def handle_callback_with_state(
        self,
        provider: str,
        code: str,
        state: str,
    ) -> OAuthConnectionResponse | None:
        payload = self._decode_oauth_state(state)
        if not payload:
            return None
        if payload.get("provider") != provider:
            return None

        user_id_raw = payload.get("user_id")
        if not user_id_raw:
            return None
        try:
            user_id = UUID(user_id_raw)
        except ValueError:
            return None

        tenant_id_raw = payload.get("tenant_id")
        tenant_id = None
        if tenant_id_raw:
            try:
                tenant_id = UUID(tenant_id_raw)
            except ValueError:
                tenant_id = None

        prov = self._get_provider(provider)
        if not prov:
            return None
        base_url = settings.APP_URL
        redirect_uri = f"{base_url}/api/v1/integrations/callback/{provider}"
        access_token, refresh_token, expires_in = await prov.exchange_code(code, redirect_uri)
        token_expires_at = None
        if expires_in:
            token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

        existing = await self.repo.get_by_provider(user_id, tenant_id, provider)
        if existing:
            await self.repo.update(
                existing,
                access_token_enc=access_token,
                refresh_token_enc=refresh_token,
                token_expires_at=token_expires_at,
                is_active=True,
            )
            await self.session.refresh(existing)
            return OAuthConnectionResponse.model_validate(existing)

        conn = await self.repo.create(
            user_id=user_id,
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

    async def list_youtube_videos(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext | None,
        *,
        source: str,
        query: str | None,
        page_token: str | None,
        max_results: int = 12,
    ) -> YouTubeVideoListResponse:
        if identity.sub_type != "user":
            return YouTubeVideoListResponse(items=[])
        tenant_id = tenant_ctx.tenant_id if tenant_ctx else None
        conn = await self.repo.get_by_provider(identity.id, tenant_id, "youtube")
        if not conn or not conn.access_token_enc:
            return YouTubeVideoListResponse(items=[])

        provider = self._get_provider("youtube")
        if not isinstance(provider, YouTubeProvider):
            return YouTubeVideoListResponse(items=[])

        # Refresh token when expired.
        now = datetime.now(timezone.utc)
        if conn.token_expires_at and conn.token_expires_at <= now and conn.refresh_token_enc:
            access_token, expires_in = await provider.refresh_access_token(conn.refresh_token_enc)
            expires_at = None
            if expires_in:
                expires_at = now + timedelta(seconds=expires_in)
            await self.repo.update(conn, access_token_enc=access_token, token_expires_at=expires_at)

        data = await provider.list_videos(
            conn.access_token_enc,
            source=source,
            query=query,
            page_token=page_token,
            max_results=max_results,
        )
        return YouTubeVideoListResponse(**data)
