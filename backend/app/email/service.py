"""Email service with multi-provider routing and automatic failover."""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.email.providers.base import BaseEmailProvider
from app.email.providers.mailgun import MailgunProvider
from app.email.providers.postmark import PostmarkProvider
from app.email.providers.ses import SESProvider

from .repository import EmailLogRepository, EmailProviderRepository
from .schemas import EmailLogListResponse, EmailLogResponse, EmailProviderResponse, EmailProviderUpdate

logger = logging.getLogger(__name__)

_PROVIDER_CLASSES: dict[str, type[BaseEmailProvider]] = {
    "postmark": PostmarkProvider,
    "mailgun": MailgunProvider,
    "ses": SESProvider,
}


class EmailService:
    """Email service with multi-provider routing and automatic failover."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.provider_repo = EmailProviderRepository(session)
        self.log_repo = EmailLogRepository(session)

    def _get_provider_instance(self, provider_record) -> BaseEmailProvider | None:
        """Get provider instance from database record."""
        config = provider_record.config or {}
        cls = _PROVIDER_CLASSES.get(provider_record.provider)
        if not cls:
            return None
        return cls(config)

    async def send_email(
        self,
        *,
        to: str | list[str],
        subject: str,
        body_text: str | None = None,
        body_html: str | None = None,
        from_email: str | None = None,
        reply_to: str | None = None,
    ) -> tuple[bool, str | None]:
        """
        Send email with automatic failover across providers.

        Returns (success, message_id or error).
        """
        providers = await self.provider_repo.list_active_ordered()
        recipients = to if isinstance(to, list) else [to]
        recipient_str = ", ".join(recipients)

        last_error: str | None = None
        for provider_record in providers:
            provider_instance = self._get_provider_instance(provider_record)
            if not provider_instance:
                continue
            try:
                success, message_id, error = await provider_instance.send(
                    to=to,
                    subject=subject,
                    body_text=body_text,
                    body_html=body_html,
                    from_email=from_email,
                    reply_to=reply_to,
                )
                status = "sent" if success else "failed"
                await self.log_repo.create(
                    provider=provider_record.provider,
                    recipient=recipient_str,
                    subject=subject,
                    status=status,
                    message_id=message_id,
                    error=error,
                )
                if success:
                    logger.info("Email sent to=%s template=%s", recipient_str, subject)
                    return True, message_id
                last_error = error
            except Exception as e:
                await self.log_repo.create(
                    provider=provider_record.provider,
                    recipient=recipient_str,
                    subject=subject,
                    status="failed",
                    error=str(e),
                )
                last_error = str(e)
        logger.error("Email send failed to=%s error=%s", recipient_str, last_error)
        return False, last_error

    async def list_providers(self) -> list[EmailProviderResponse]:
        """List all email providers."""
        providers = await self.provider_repo.list_all()
        return [EmailProviderResponse.model_validate(p) for p in providers]

    async def get_provider(self, provider_id) -> EmailProviderResponse | None:
        """Get email provider by ID."""
        provider = await self.provider_repo.get_by_id(provider_id)
        return EmailProviderResponse.model_validate(provider) if provider else None

    async def update_provider(
        self,
        provider_id,
        data: EmailProviderUpdate,
    ) -> EmailProviderResponse | None:
        """Update email provider."""
        provider = await self.provider_repo.get_by_id(provider_id)
        if not provider:
            return None
        update_data = data.model_dump(exclude_unset=True)
        await self.provider_repo.update(provider, **update_data)
        return EmailProviderResponse.model_validate(provider)

    async def list_logs(
        self,
        *,
        skip: int = 0,
        limit: int = 50,
        provider: str | None = None,
        status: str | None = None,
    ) -> EmailLogListResponse:
        """List email logs."""
        logs, total = await self.log_repo.list_logs(
            skip=skip,
            limit=limit,
            provider=provider,
            status=status,
        )
        return EmailLogListResponse(
            items=[EmailLogResponse.model_validate(l) for l in logs],
            total=total,
        )
