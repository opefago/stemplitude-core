"""Meeting creation service — resolves OAuth tokens and delegates to providers."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.integrations.models import OAuthConnection
from app.integrations.providers.base import BaseIntegrationProvider
from app.integrations.providers.google import GoogleProvider
from app.integrations.providers.microsoft import MicrosoftProvider
from app.integrations.providers.zoom import ZoomProvider
from app.integrations.repository import OAuthConnectionRepository

logger = logging.getLogger(__name__)

PROVIDER_MAP: dict[str, str] = {
    "zoom": "zoom",
    "meet": "google",
    "google": "google",
    "teams": "microsoft",
    "microsoft": "microsoft",
}

_PROVIDER_CLASSES: dict[str, type[BaseIntegrationProvider]] = {
    "zoom": ZoomProvider,
    "google": GoogleProvider,
    "microsoft": MicrosoftProvider,
}


@dataclass
class MeetingResult:
    meeting_link: str
    external_meeting_id: str
    provider: str


class MeetingServiceError(Exception):
    """Raised when meeting creation fails with a user-facing message."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class MeetingService:
    """Creates and manages meetings via third-party providers using stored OAuth tokens."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.oauth_repo = OAuthConnectionRepository(session)

    async def create_meeting(
        self,
        *,
        user_id: UUID,
        tenant_id: UUID,
        provider_key: str,
        title: str,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> MeetingResult:
        """Create a meeting via the requested provider.

        Args:
            user_id: The instructor whose OAuth credentials to use.
            tenant_id: Tenant context for the OAuth lookup.
            provider_key: One of 'zoom', 'meet'/'google', 'teams'/'microsoft'.
            title: Meeting title (typically the classroom name).
            start/end: Optional scheduling window; defaults to now + 2 hours.
        """
        oauth_provider = PROVIDER_MAP.get(provider_key)
        if not oauth_provider:
            raise MeetingServiceError(
                f"Unsupported meeting provider: '{provider_key}'. "
                f"Supported: zoom, meet, teams.",
            )

        connection = await self.oauth_repo.get_by_provider(user_id, tenant_id, oauth_provider)
        if not connection or not connection.is_active:
            raise MeetingServiceError(
                f"No {provider_key} account linked. "
                f"Please connect your {provider_key} account in Settings → Integrations.",
                status_code=422,
            )

        access_token = await self._get_valid_token(connection, oauth_provider)

        provider_instance = self._build_provider(oauth_provider)

        now = datetime.now(timezone.utc)
        meeting_start = start or now
        meeting_end = end or (meeting_start + timedelta(hours=2))

        logger.info(
            "Creating %s meeting for user=%s tenant=%s title=%s",
            provider_key, user_id, tenant_id, title,
        )

        result = await provider_instance.create_meeting(
            access_token,
            title=title,
            start=meeting_start,
            end=meeting_end,
        )

        meeting_id = result.get("id", "")
        join_url = result.get("join_url", "")

        if not join_url:
            raise MeetingServiceError(
                f"Provider '{provider_key}' returned no meeting link. "
                f"This may indicate an expired token or insufficient permissions.",
                status_code=502,
            )

        logger.info(
            "Meeting created provider=%s meeting_id=%s",
            provider_key, meeting_id,
        )

        return MeetingResult(
            meeting_link=join_url,
            external_meeting_id=meeting_id,
            provider=oauth_provider,
        )

    async def delete_meeting(
        self,
        *,
        user_id: UUID,
        tenant_id: UUID,
        provider_key: str,
        external_meeting_id: str,
    ) -> bool:
        """Delete an existing meeting via the provider."""
        oauth_provider = PROVIDER_MAP.get(provider_key)
        if not oauth_provider:
            return False

        connection = await self.oauth_repo.get_by_provider(user_id, tenant_id, oauth_provider)
        if not connection or not connection.is_active:
            return False

        access_token = await self._get_valid_token(connection, oauth_provider)
        provider_instance = self._build_provider(oauth_provider)
        return await provider_instance.delete_meeting(access_token, external_meeting_id)

    async def _get_valid_token(self, connection: OAuthConnection, oauth_provider: str) -> str:
        """Return a valid access token, refreshing if expired."""
        now = datetime.now(timezone.utc)

        if connection.token_expires_at and connection.token_expires_at <= now:
            if not connection.refresh_token_enc:
                raise MeetingServiceError(
                    "OAuth token expired and no refresh token available. "
                    "Please reconnect your account in Settings → Integrations.",
                    status_code=401,
                )

            logger.info("Refreshing expired token for provider=%s", oauth_provider)
            provider_instance = self._build_provider(oauth_provider)
            new_token, expires_in = await provider_instance.refresh_access_token(
                connection.refresh_token_enc
            )

            if not new_token:
                raise MeetingServiceError(
                    "Failed to refresh OAuth token. "
                    "Please reconnect your account in Settings → Integrations.",
                    status_code=401,
                )

            token_expires_at = None
            if expires_in:
                token_expires_at = now + timedelta(seconds=expires_in)

            await self.oauth_repo.update(
                connection,
                access_token_enc=new_token,
                token_expires_at=token_expires_at,
            )
            return new_token

        if not connection.access_token_enc:
            raise MeetingServiceError(
                "No access token stored. Please reconnect your account in Settings → Integrations.",
                status_code=401,
            )

        return connection.access_token_enc

    def _build_provider(self, oauth_provider: str) -> BaseIntegrationProvider:
        cls = _PROVIDER_CLASSES.get(oauth_provider)
        if not cls:
            raise MeetingServiceError(f"No provider implementation for '{oauth_provider}'")

        client_id = getattr(settings, f"{oauth_provider.upper()}_CLIENT_ID", "")
        client_secret = getattr(settings, f"{oauth_provider.upper()}_CLIENT_SECRET", "")
        return cls(client_id=client_id, client_secret=client_secret)
