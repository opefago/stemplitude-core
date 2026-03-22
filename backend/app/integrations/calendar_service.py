"""Calendar sync service."""

from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.models import OAuthConnection
from app.integrations.providers.base import CalendarEvent
from app.integrations.providers.google import GoogleProvider
from app.integrations.providers.microsoft import MicrosoftProvider
from app.integrations.providers.zoom import ZoomProvider

_PROVIDER_CLASSES = {
    "zoom": ZoomProvider,
    "google": GoogleProvider,
    "microsoft": MicrosoftProvider,
}


class CalendarSyncService:
    """Service for syncing calendar events from OAuth connections."""

    def __init__(self, session: AsyncSession):
        self.session = session

    def _get_provider(self, connection: OAuthConnection):
        """Get provider instance for connection. TODO: Load config from app.config."""
        from app.config import settings

        configs = {
            "zoom": {"client_id": "", "client_secret": ""},
            "google": {"client_id": "", "client_secret": ""},
            "microsoft": {"client_id": "", "client_secret": ""},
        }
        cfg = configs.get(connection.provider, {})
        cls = _PROVIDER_CLASSES.get(connection.provider)
        if not cls:
            return None
        return cls(
            client_id=cfg.get("client_id", ""),
            client_secret=cfg.get("client_secret", ""),
        )

    async def sync_connection(
        self,
        connection: OAuthConnection,
        *,
        start: datetime,
        end: datetime,
    ) -> list[CalendarEvent]:
        """
        Sync calendar events for an OAuth connection.

        TODO: Decrypt access_token_enc, refresh if expired.
        """
        provider = self._get_provider(connection)
        if not provider:
            return []
        # TODO: Decrypt tokens from connection.access_token_enc
        access_token = connection.access_token_enc or ""
        if not access_token:
            return []
        return await provider.sync_calendar(
            access_token,
            calendar_id=connection.calendar_id,
            start=start,
            end=end,
        )
