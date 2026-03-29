"""Email service with multi-provider routing and automatic failover."""

import json
import logging
import os
import random
import re
from datetime import datetime, timezone
from email.utils import parseaddr
from pathlib import Path
from uuid import UUID

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.email.models import EmailProvider
from app.email.providers.base import BaseEmailProvider
from app.email.providers.mailgun import MailgunProvider
from app.email.providers.postmark import PostmarkProvider
from app.email.providers.resend import ResendProvider
from app.email.providers.ses import SESProvider
from app.email.providers.sendgrid import SendGridProvider

from app.email.attachments import EmailAttachment
from app.email.routing_errors import is_retryable_email_failure

from app.email.unsubscribe import is_critical_email_route, normalize_subscriber_email

from .repository import (
    EmailLogRepository,
    EmailProviderDomainHealthRepository,
    EmailProviderRepository,
    EmailSuppressionRepository,
)
from .schemas import EmailLogListResponse, EmailLogResponse, EmailProviderResponse, EmailProviderUpdate

logger = logging.getLogger(__name__)

try:
    import tldextract as _tldextract
except ImportError:
    _tldextract = None
    logger.warning(
        "tldextract is not installed; email routing health keys use the full mailbox host. "
        "Install dependencies (pip install -r requirements.txt) for registrable-domain grouping."
    )

_PROVIDER_CLASSES: dict[str, type[BaseEmailProvider]] = {
    "postmark": PostmarkProvider,
    "mailgun": MailgunProvider,
    "ses": SESProvider,
    "sendgrid": SendGridProvider,
    "resend": ResendProvider,
}

_EMAIL_PROVIDER_REGISTRY_PATH = (
    Path(__file__).resolve().parents[2] / "config" / "email_provider_registry.json"
)


def _recipient_domains(recipients: list[str]) -> set[str]:
    """Registrable domains (eTLD+1) for routing health, from ``to`` addresses.

    Uses :func:`email.utils.parseaddr` for ``Name <addr>`` forms, :func:`email_validator.validate_email`
    for IDNA / normalization, and ``tldextract`` (if installed) for the **registrable** domain so
    ``user@mail.school.edu`` and ``user@www.school.edu`` can map to one key. Without ``tldextract``,
    the normalized mailbox host is used. URLs are not handled here.
    """
    out: set[str] = set()
    for raw in recipients:
        for chunk in re.split(r"[,;]", raw):
            chunk = chunk.strip()
            if not chunk:
                continue
            _, addr = parseaddr(chunk)
            target = (addr or chunk).strip().strip("<>")
            if "@" not in target:
                continue
            try:
                validated = validate_email(target, check_deliverability=False)
            except EmailNotValidError:
                continue
            host = (validated.domain or "").strip().lower()
            if not host or "." not in host:
                continue
            if _tldextract is not None:
                ext = _tldextract.extract(host)
                reg = (ext.registered_domain or "").strip().lower()
                out.add(reg if reg else host)
            else:
                out.add(host)
    return out


def _weighted_provider_order(
    records: list[EmailProvider],
    rng: random.Random | None = None,
) -> list[EmailProvider]:
    """Without replacement: higher weight for lower ``priority`` (ascending preference)."""
    rng = rng or random.Random()
    pool = list(records)
    if len(pool) <= 1:
        return pool
    max_pri = max(p.priority for p in pool)
    order: list[EmailProvider] = []
    while pool:
        weights = [float(max_pri - p.priority + 1) for p in pool]
        total = sum(weights)
        r = rng.random() * total
        acc = 0.0
        chosen = 0
        for i, w in enumerate(weights):
            acc += w
            if r <= acc:
                chosen = i
                break
        order.append(pool.pop(chosen))
    return order


class EmailService:
    """Email service with multi-provider routing and automatic failover."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.provider_repo = EmailProviderRepository(session)
        self.log_repo = EmailLogRepository(session)
        self.domain_health_repo = EmailProviderDomainHealthRepository(session)

    @staticmethod
    def _merge_provider_runtime_config(provider_key: str, config: dict | None) -> dict:
        """Merge DB JSON config with .env so tokens work without duplicating them in the DB."""
        out = dict(config or {})

        if provider_key == "postmark":
            if not str(out.get("server_token") or "").strip():
                t = (
                    os.environ.get("POSTMARK_SERVER_TOKEN", "")
                    or settings.POSTMARK_SERVER_TOKEN
                    or ""
                ).strip()
                if t:
                    out["server_token"] = t
        elif provider_key == "sendgrid":
            if not str(out.get("api_key") or "").strip():
                k = (
                    os.environ.get("SENDGRID_API_KEY", "")
                    or settings.SENDGRID_API_KEY
                    or ""
                ).strip()
                if k:
                    out["api_key"] = k
        elif provider_key == "resend":
            if not str(out.get("api_key") or "").strip():
                k = (
                    os.environ.get("RESEND_API_KEY", "") or settings.RESEND_API_KEY or ""
                ).strip()
                if k:
                    out["api_key"] = k
        elif provider_key == "ses":
            if not str(out.get("access_key_id") or "").strip():
                v = (
                    os.environ.get("AWS_SES_ACCESS_KEY_ID", "")
                    or settings.AWS_SES_ACCESS_KEY_ID
                    or ""
                ).strip()
                if v:
                    out["access_key_id"] = v
            if not str(out.get("secret_access_key") or "").strip():
                v = (
                    os.environ.get("AWS_SES_SECRET_ACCESS_KEY", "")
                    or settings.AWS_SES_SECRET_ACCESS_KEY
                    or ""
                ).strip()
                if v:
                    out["secret_access_key"] = v
            if not str(out.get("region") or "").strip():
                v = (
                    os.environ.get("AWS_SES_REGION", "") or settings.AWS_SES_REGION or ""
                ).strip()
                if v:
                    out["region"] = v
        elif provider_key == "mailgun":
            if not str(out.get("api_key") or "").strip():
                v = (
                    os.environ.get("MAILGUN_API_KEY", "")
                    or settings.MAILGUN_API_KEY
                    or ""
                ).strip()
                if v:
                    out["api_key"] = v
            if not str(out.get("domain") or "").strip():
                v = (
                    os.environ.get("MAILGUN_DOMAIN", "") or settings.MAILGUN_DOMAIN or ""
                ).strip()
                if v:
                    out["domain"] = v

        if not str(out.get("sender_email") or "").strip():
            env_key = {
                "postmark": "POSTMARK_SENDER_EMAIL",
                "sendgrid": "SENDGRID_SENDER_EMAIL",
                "resend": "RESEND_SENDER_EMAIL",
                "ses": "AWS_SES_SENDER_EMAIL",
            }.get(provider_key)
            from_env = (os.environ.get(env_key, "").strip() if env_key else "") or ""
            per_settings = {
                "postmark": settings.POSTMARK_SENDER_EMAIL,
                "sendgrid": settings.SENDGRID_SENDER_EMAIL,
                "resend": settings.RESEND_SENDER_EMAIL,
                "ses": settings.AWS_SES_SENDER_EMAIL,
            }
            candidate = (from_env or str(per_settings.get(provider_key, "") or "")).strip()
            out["sender_email"] = candidate or settings.EMAIL_DEFAULT_SENDER

        return out

    @staticmethod
    def _provider_has_credentials(provider_key: str, config: dict) -> bool:
        """True if merged config includes the secrets required for that provider."""
        if provider_key == "postmark":
            return bool(str(config.get("server_token") or "").strip())
        if provider_key == "sendgrid":
            return bool(str(config.get("api_key") or "").strip())
        if provider_key == "resend":
            return bool(str(config.get("api_key") or "").strip())
        if provider_key == "ses":
            return bool(str(config.get("access_key_id") or "").strip()) and bool(
                str(config.get("secret_access_key") or "").strip()
            )
        if provider_key == "mailgun":
            return bool(str(config.get("api_key") or "").strip()) and bool(
                str(config.get("domain") or "").strip()
            )
        return True

    def _get_provider_instance(self, provider_record) -> BaseEmailProvider | None:
        """Get provider instance from database record."""
        config = self._merge_provider_runtime_config(
            provider_record.provider,
            provider_record.config if isinstance(provider_record.config, dict) else {},
        )
        cls = _PROVIDER_CLASSES.get(provider_record.provider)
        if not cls:
            return None
        if not self._provider_has_credentials(provider_record.provider, config):
            logger.debug(
                "Skipping email provider %s: no credentials in DB or env",
                provider_record.provider,
            )
            return None
        return cls(config)

    async def _ensure_registry_providers(self) -> None:
        """Backfill missing providers from registry into EmailProvider table."""
        try:
            data = json.loads(_EMAIL_PROVIDER_REGISTRY_PATH.read_text(encoding="utf-8"))
            registry = data.get("providers", [])
            if not isinstance(registry, list):
                return
        except Exception:
            logger.warning("Failed to read email provider registry", exc_info=True)
            return

        existing_result = await self.session.execute(select(EmailProvider.provider))
        existing = {row[0] for row in existing_result.all()}

        for provider_def in registry:
            provider = str(provider_def.get("provider", "")).strip().lower()
            if not provider or provider in existing:
                continue
            priority = int(provider_def.get("priority", 100))
            self.session.add(
                EmailProvider(
                    provider=provider,
                    is_active=False,
                    priority=priority,
                )
            )
        await self.session.flush()

    async def _resolve_routed_providers(
        self,
        *,
        route_key: str | None,
    ):
        """Resolve provider order from globally active providers and route hints."""
        providers = await self.provider_repo.list_active_ordered()
        key = (route_key or "default").strip().lower()
        if key == "default":
            return providers

        # Optional platform-level route gating:
        # provider.config.route_keys = ["default", "invite", ...]
        routed: list = []
        for provider in providers:
            config = provider.config if isinstance(provider.config, dict) else {}
            route_keys = config.get("route_keys")
            if not isinstance(route_keys, list) or not route_keys:
                routed.append(provider)
                continue
            normalized = {
                str(item).strip().lower()
                for item in route_keys
                if isinstance(item, str)
            }
            if key in normalized or "default" in normalized or "*" in normalized:
                routed.append(provider)
        return routed if routed else providers

    async def send_email(
        self,
        *,
        to: str | list[str],
        subject: str,
        body_text: str | None = None,
        body_html: str | None = None,
        from_email: str | None = None,
        reply_to: str | None = None,
        tenant_id: UUID | str | None = None,
        route_key: str | None = None,
        attachments: list[EmailAttachment] | None = None,
        list_unsubscribe_url: str | None = None,
    ) -> tuple[bool, str | None]:
        """
        Send email with automatic failover across providers.

        Order of attempts is a **weighted random shuffle** by ``priority`` (lower number = higher
        weight). Providers in an active **per-domain cooldown** (after recent failures to that
        recipient domain) are skipped unless every provider is cooling down, in which case the
        full list is retried.

        Returns (success, message_id or error).
        """
        providers = await self._resolve_routed_providers(
            route_key=route_key,
        )
        recipients = to if isinstance(to, list) else [to]
        recipient_str = ", ".join(recipients)

        rk = (route_key or "default").strip().lower()
        tid: UUID | None = None
        if tenant_id is not None and str(tenant_id).strip():
            try:
                tid = UUID(str(tenant_id))
            except ValueError:
                tid = None
        if len(recipients) == 1:
            norm = normalize_subscriber_email(recipients[0])
            if norm:
                sup_repo = EmailSuppressionRepository(self.session)
                if await sup_repo.is_recipient_deliverability_suppressed(email_normalized=norm):
                    logger.info(
                        "Email skipped (deliverability suppression) to=%s route_key=%s",
                        recipient_str,
                        rk,
                    )
                    return False, "recipient_deliverability_suppressed"
                if not is_critical_email_route(rk) and await sup_repo.is_recipient_suppressed_non_transactional(
                    email_normalized=norm,
                    send_tenant_id=tid,
                ):
                    logger.info(
                        "Email skipped (recipient opted out) to=%s tenant_id=%s route_key=%s",
                        recipient_str,
                        tid,
                        rk,
                    )
                    return False, "recipient_opted_out"

        extra_headers: dict[str, str] | None = None
        if (list_unsubscribe_url or "").strip():
            u = list_unsubscribe_url.strip()
            extra_headers = {
                "List-Unsubscribe": f"<{u}>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }

        if not providers:
            error_message = "No enabled email providers available for routing"
            logger.error(
                "Email send failed to=%s error=%s tenant_id=%s route_key=%s",
                recipient_str,
                error_message,
                tenant_id,
                route_key,
            )
            return False, error_message

        domains = _recipient_domains(recipients)
        now = datetime.now(timezone.utc)

        instantiated: list[tuple[EmailProvider, BaseEmailProvider]] = []
        for provider_record in providers:
            provider_instance = self._get_provider_instance(provider_record)
            if provider_instance:
                instantiated.append((provider_record, provider_instance))

        last_error: str | None = None
        attempted_send = False

        if not instantiated:
            last_error = "No email provider with valid credentials (check Platform → Email or .env)"
            logger.error("Email send failed to=%s error=%s", recipient_str, last_error)
            return False, last_error

        eligible = [
            pair
            for pair in instantiated
            if not domains
            or not await self.domain_health_repo.suppressed_for_any_domain(
                provider=pair[0].provider,
                domains=domains,
                now=now,
            )
        ]
        if not eligible:
            logger.warning(
                "All providers in cooldown for domains=%s; falling back to full provider list",
                sorted(domains),
            )
            eligible = list(instantiated)

        attempt_order = _weighted_provider_order([pr for pr, _ in eligible])
        inst_by_slug = {pr.provider: inst for pr, inst in eligible}

        for provider_record in attempt_order:
            provider_instance = inst_by_slug.get(provider_record.provider)
            if not provider_instance:
                continue
            attempted_send = True
            try:
                success, message_id, error = await provider_instance.send(
                    to=to,
                    subject=subject,
                    body_text=body_text,
                    body_html=body_html,
                    from_email=from_email,
                    reply_to=reply_to,
                    attachments=attachments,
                    extra_headers=extra_headers,
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
                if domains:
                    retryable_failure = (
                        is_retryable_email_failure(error_message=error, exc=None)
                        if not success
                        else True
                    )
                    for d in domains:
                        await self.domain_health_repo.record_attempt(
                            provider=provider_record.provider,
                            domain=d,
                            success=success,
                            retryable_failure=retryable_failure,
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
                if domains:
                    retryable = is_retryable_email_failure(error_message=str(e), exc=e)
                    for d in domains:
                        await self.domain_health_repo.record_attempt(
                            provider=provider_record.provider,
                            domain=d,
                            success=False,
                            retryable_failure=retryable,
                        )
                last_error = str(e)
        if not attempted_send:
            last_error = "No email provider with valid credentials (check Platform → Email or .env)"
        logger.error("Email send failed to=%s error=%s", recipient_str, last_error)
        return False, last_error

    async def send(
        self,
        *,
        recipient: str | list[str],
        subject: str,
        body: str | None = None,
        html_body: str | None = None,
        from_email: str | None = None,
        reply_to: str | None = None,
        tenant_id: UUID | str | None = None,
        route_key: str | None = None,
        attachments: list[EmailAttachment] | None = None,
        list_unsubscribe_url: str | None = None,
    ) -> tuple[bool, str | None]:
        """Backward-compatible wrapper used by worker tasks."""
        return await self.send_email(
            to=recipient,
            subject=subject,
            body_text=body,
            body_html=html_body,
            from_email=from_email,
            reply_to=reply_to,
            tenant_id=tenant_id,
            route_key=route_key,
            attachments=attachments,
            list_unsubscribe_url=list_unsubscribe_url,
        )

    async def list_providers(self) -> list[EmailProviderResponse]:
        """List all email providers."""
        await self._ensure_registry_providers()
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
