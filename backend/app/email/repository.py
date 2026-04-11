"""Email repository."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.email.models import EmailLog, EmailProvider, EmailProviderDomainHealth, EmailSuppression


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

    async def delete_batch_older_than(
        self,
        cutoff: datetime,
        *,
        batch_size: int = 5000,
    ) -> int:
        """Delete up to ``batch_size`` rows with ``created_at`` before ``cutoff``. Does not commit."""
        id_subq = select(EmailLog.id).where(EmailLog.created_at < cutoff).limit(batch_size)
        result = await self.session.execute(delete(EmailLog).where(EmailLog.id.in_(id_subq)))
        return int(result.rowcount or 0)


class EmailProviderDomainHealthRepository:
    """Per-provider, per-recipient-domain outcomes for adaptive routing."""

    _COOLDOWN_AFTER_STREAK = 2
    _BACKOFF_CAP = timedelta(days=7)
    _BACKOFF_BASE_SECONDS = 120

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, provider: str, domain: str) -> EmailProviderDomainHealth | None:
        d = (domain or "").strip().lower()
        if not d:
            return None
        result = await self.session.execute(
            select(EmailProviderDomainHealth).where(
                EmailProviderDomainHealth.provider == provider,
                EmailProviderDomainHealth.domain == d,
            )
        )
        return result.scalar_one_or_none()

    def _cooldown_for_streak(self, streak: int) -> timedelta:
        if streak < self._COOLDOWN_AFTER_STREAK:
            return timedelta(0)
        if streak >= 10:
            return self._BACKOFF_CAP
        exp = min(streak - (self._COOLDOWN_AFTER_STREAK - 1), 12)
        cap = int(self._BACKOFF_CAP.total_seconds())
        secs = min(cap, self._BACKOFF_BASE_SECONDS * (2 ** (exp - 1)))
        return timedelta(seconds=max(secs, self._BACKOFF_BASE_SECONDS))

    async def record_attempt(
        self,
        *,
        provider: str,
        domain: str,
        success: bool,
        retryable_failure: bool = True,
    ) -> None:
        """Update streaks and cooldown for one (provider, recipient-domain) pair.

        Non-retryable failures (bad auth, validation, etc.) do not increment streaks or cooldowns.
        """
        d = (domain or "").strip().lower()
        if not d:
            return
        p = (provider or "").strip().lower()
        if not p:
            return
        now = datetime.now(timezone.utc)
        row = await self.get(p, d)
        if row is None:
            row = EmailProviderDomainHealth(provider=p, domain=d, failure_streak=0)
            self.session.add(row)
            await self.session.flush()

        if success:
            row.failure_streak = 0
            row.cooldown_until = None
            row.last_success_at = now
            return

        if not retryable_failure:
            return

        row.failure_streak = int(row.failure_streak or 0) + 1
        row.last_failure_at = now
        delta = self._cooldown_for_streak(row.failure_streak)
        if delta.total_seconds() <= 0:
            return
        cool_until = now + delta
        prev = row.cooldown_until
        if prev is None or cool_until > prev:
            row.cooldown_until = cool_until

    async def is_in_cooldown(self, *, provider: str, domain: str, now: datetime) -> bool:
        row = await self.get(provider, domain)
        if row is None or row.cooldown_until is None:
            return False
        return row.cooldown_until > now

    async def suppressed_for_any_domain(
        self,
        *,
        provider: str,
        domains: set[str],
        now: datetime,
    ) -> bool:
        """True if this provider should be skipped for this send (any recipient domain hot)."""
        for d in domains:
            if await self.is_in_cooldown(provider=provider, domain=d, now=now):
                return True
        return False


class EmailSuppressionRepository:
    """Recipient opt-outs and deliverability blocks."""

    SCOPE_NON_TRANSACTIONAL = "non_transactional"
    SCOPE_DELIVERABILITY = "deliverability"

    def __init__(self, session: AsyncSession):
        self.session = session

    async def is_recipient_deliverability_suppressed(self, *, email_normalized: str) -> bool:
        """True if address is globally blocked (hard bounce / complaint). Applies to all mail."""
        e = (email_normalized or "").strip().lower()
        if not e:
            return False
        stmt = (
            select(EmailSuppression.id)
            .where(
                EmailSuppression.email_normalized == e,
                EmailSuppression.tenant_id.is_(None),
                EmailSuppression.scope == self.SCOPE_DELIVERABILITY,
            )
            .limit(1)
        )
        r = await self.session.execute(stmt)
        return r.scalar_one_or_none() is not None

    async def record_deliverability_suppression(
        self,
        *,
        email_normalized: str,
        source: str,
    ) -> bool:
        e = (email_normalized or "").strip().lower()
        if not e:
            return False
        filters = [
            EmailSuppression.email_normalized == e,
            EmailSuppression.tenant_id.is_(None),
            EmailSuppression.scope == self.SCOPE_DELIVERABILITY,
        ]
        existing = await self.session.execute(select(EmailSuppression).where(*filters).limit(1))
        if existing.scalar_one_or_none():
            return False
        self.session.add(
            EmailSuppression(
                email_normalized=e,
                tenant_id=None,
                scope=self.SCOPE_DELIVERABILITY,
                source=(source or "webhook")[:32],
            )
        )
        await self.session.flush()
        return True

    async def is_recipient_suppressed_non_transactional(
        self,
        *,
        email_normalized: str,
        send_tenant_id: UUID | None,
    ) -> bool:
        e = (email_normalized or "").strip().lower()
        if not e:
            return False
        if send_tenant_id is None:
            stmt = (
                select(EmailSuppression.id)
                .where(
                    EmailSuppression.email_normalized == e,
                    EmailSuppression.tenant_id.is_(None),
                    EmailSuppression.scope == self.SCOPE_NON_TRANSACTIONAL,
                )
                .limit(1)
            )
        else:
            stmt = (
                select(EmailSuppression.id)
                .where(
                    EmailSuppression.email_normalized == e,
                    EmailSuppression.scope == self.SCOPE_NON_TRANSACTIONAL,
                    or_(
                        EmailSuppression.tenant_id.is_(None),
                        EmailSuppression.tenant_id == send_tenant_id,
                    ),
                )
                .limit(1)
            )
        r = await self.session.execute(stmt)
        return r.scalar_one_or_none() is not None

    async def record_non_transactional_suppression(
        self,
        *,
        email_normalized: str,
        tenant_id: UUID | None,
        source: str = "one_click",
    ) -> None:
        e = (email_normalized or "").strip().lower()
        if not e:
            return
        filters = [
            EmailSuppression.email_normalized == e,
            EmailSuppression.scope == self.SCOPE_NON_TRANSACTIONAL,
        ]
        if tenant_id is None:
            filters.append(EmailSuppression.tenant_id.is_(None))
        else:
            filters.append(EmailSuppression.tenant_id == tenant_id)
        existing = await self.session.execute(select(EmailSuppression).where(*filters).limit(1))
        if existing.scalar_one_or_none():
            return
        self.session.add(
            EmailSuppression(
                email_normalized=e,
                tenant_id=tenant_id,
                scope=self.SCOPE_NON_TRANSACTIONAL,
                source=(source or "one_click")[:32],
            )
        )
        await self.session.flush()
