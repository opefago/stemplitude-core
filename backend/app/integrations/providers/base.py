"""Base integration provider (abstract)."""

from abc import ABC, abstractmethod
from datetime import datetime


class CalendarEvent:
    """Calendar event representation."""

    def __init__(
        self,
        id: str,
        title: str,
        start: datetime,
        end: datetime,
        description: str | None = None,
        location: str | None = None,
        meeting_url: str | None = None,
    ):
        self.id = id
        self.title = title
        self.start = start
        self.end = end
        self.description = description
        self.location = location
        self.meeting_url = meeting_url


class BaseIntegrationProvider(ABC):
    """Abstract base class for OAuth integration providers (Zoom, Google, Microsoft)."""

    provider_name: str = "base"

    @abstractmethod
    def get_authorization_url(self, state: str, redirect_uri: str, scopes: list[str]) -> str:
        """Get OAuth authorization URL."""
        ...

    @abstractmethod
    async def exchange_code(
        self, code: str, redirect_uri: str
    ) -> tuple[str, str | None, int | None]:
        """
        Exchange authorization code for tokens.

        Returns (access_token, refresh_token, expires_in_seconds).
        """
        ...

    @abstractmethod
    async def refresh_access_token(self, refresh_token: str) -> tuple[str, int | None]:
        """
        Refresh access token.

        Returns (access_token, expires_in_seconds).
        """
        ...

    @abstractmethod
    async def create_meeting(
        self,
        access_token: str,
        *,
        title: str,
        start: datetime,
        end: datetime,
        description: str | None = None,
    ) -> dict:
        """
        Create a calendar/meeting event.

        Returns dict with id, join_url, etc.
        """
        ...

    @abstractmethod
    async def delete_meeting(self, access_token: str, meeting_id: str) -> bool:
        """Delete a meeting/event."""
        ...

    @abstractmethod
    async def sync_calendar(
        self,
        access_token: str,
        calendar_id: str | None = None,
        *,
        start: datetime,
        end: datetime,
    ) -> list[CalendarEvent]:
        """Sync/fetch calendar events for a date range."""
        ...
