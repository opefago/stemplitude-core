"""Email repository."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.email.models import EmailLog, EmailProvider


class EmailProviderRepository:
    """Repository for email provider queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, provider_id: UUID) -> EmailProvider | None:
        """Get email provider by ID."""
        result = await self.session.execute(
            select(EmailProvider).where(EmailProvider.id == provider_id)
        )
        return result.scalar_one_or_none()

    async def list_active_ordered(self) -> list[EmailProvider]:
        """List active providers ordered by priority (ascending, lower = higher priority)."""
        result = await self.session.execute(
            select(EmailProvider)
            .where(EmailProvider.is_active == True)
            .order_by(EmailProvider.priority.asc())
        )
        return list(result.scalars().all())

    async def list_all(self) -> list[EmailProvider]:
        """List all email providers."""
        result = await self.session.execute(
            select(EmailProvider).order_by(EmailProvider.priority.asc())
        )
        return list(result.scalars().all())

    async def update(
        self,
        provider: EmailProvider,
        *,
        is_active: bool | None = None,
        priority: int | None = None,
        config: dict | None = None,
    ) -> EmailProvider:
        """Update email provider."""
        if is_active is not None:
            provider.is_active = is_active
        if priority is not None:
            provider.priority = priority
        if config is not None:
            provider.config = config
        await self.session.flush()
        await self.session.refresh(provider)
        return provider


class EmailLogRepository:
    """Repository for email log queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        *,
        provider: str,
        recipient: str,
        subject: str,
        status: str,
        message_id: str | None = None,
        error: str | None = None,
    ) -> EmailLog:
        """Create email log entry."""
        log = EmailLog(
            provider=provider,
            recipient=recipient,
            subject=subject,
            status=status,
            message_id=message_id,
            error=error,
        )
        self.session.add(log)
        await self.session.flush()
        await self.session.refresh(log)
        return log

    async def list_logs(
        self,
        *,
        skip: int = 0,
        limit: int = 50,
        provider: str | None = None,
        status: str | None = None,
    ) -> tuple[list[EmailLog], int]:
        """List email logs."""
        base = select(EmailLog)
        count_base = select(func.count()).select_from(EmailLog)
        if provider is not None:
            base = base.where(EmailLog.provider == provider)
            count_base = count_base.where(EmailLog.provider == provider)
        if status is not None:
            base = base.where(EmailLog.status == status)
            count_base = count_base.where(EmailLog.status == status)
        total_result = await self.session.execute(count_base)
        total = total_result.scalar() or 0
        result = await self.session.execute(
            base.order_by(EmailLog.created_at.desc()).offset(skip).limit(limit)
        )
        logs = list(result.scalars().all())
        return logs, total
