"""Base email provider (abstract)."""

from abc import ABC, abstractmethod


class BaseEmailProvider(ABC):
    """Abstract base class for email providers."""

    provider_name: str = "base"

    @abstractmethod
    async def send(
        self,
        *,
        to: str | list[str],
        subject: str,
        body_text: str | None = None,
        body_html: str | None = None,
        from_email: str | None = None,
        reply_to: str | None = None,
    ) -> tuple[bool, str | None, str | None]:
        """
        Send an email.

        Returns:
            Tuple of (success, message_id, error_message)
        """
        ...
