"""Transactional email routing labels and prepared payloads.

``route_key`` is passed to :class:`app.email.service.EmailService` so Platform → Email
provider rows can scope ``route_keys`` in JSON config. Use :class:`EmailRouteKey`
constants for consistency.

:class:`EmailRouteKey` includes invite and classroom slugs (see attributes on :class:`EmailRouteKey`).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.email.attachments import EmailAttachment
from app.email.templates import TransactionalEmail


@dataclass(frozen=True)
class PreparedTransactionalEmail:
    """Subject + MIME parts + routing metadata for :func:`app.email.outbox.enqueue_transactional_email`.

    Optional :class:`app.email.attachments.EmailAttachment` rows (any MIME type / binary payload)
    are sent by providers that support attachments (Postmark, SendGrid, Resend).
    """

    subject: str
    message: TransactionalEmail
    route_key: str
    footer_category: str
    attachments: tuple[EmailAttachment, ...] = field(default_factory=tuple)


class EmailRouteKey:
    """Suggested ``route_key`` values for provider routing (string slugs)."""

    INVITE = "invite"
    CLASSROOM_ENROLLMENT = "classroom_enrollment"
    CLASSROOM_SESSION_CONTENT = "classroom_session_content"
    CLASSROOM_SUBMISSION = "classroom_submission"
    CLASSROOM_GRADING = "classroom_grading"
    AUTH_VERIFY = "auth_verify"
    AUTH_OTP = "auth_otp"
    AUTH_PASSWORD_RESET = "auth_password_reset"
    ONBOARDING_WELCOME = "onboarding_welcome"
    REMINDER = "reminder"
    SECURITY = "security"
    NOTIFICATION = "notification_transactional"
    CALENDAR = "calendar_event"


def suggested_route_keys_for_platform_docs() -> list[str]:
    """Keys to document or seed on provider ``config.route_keys`` when using gated routing."""
    return sorted(
        {
            EmailRouteKey.INVITE,
            EmailRouteKey.AUTH_VERIFY,
            EmailRouteKey.AUTH_OTP,
            EmailRouteKey.AUTH_PASSWORD_RESET,
            EmailRouteKey.ONBOARDING_WELCOME,
            EmailRouteKey.REMINDER,
            EmailRouteKey.SECURITY,
            EmailRouteKey.NOTIFICATION,
            EmailRouteKey.CLASSROOM_ENROLLMENT,
            EmailRouteKey.CLASSROOM_SESSION_CONTENT,
            EmailRouteKey.CLASSROOM_SUBMISSION,
            EmailRouteKey.CLASSROOM_GRADING,
            EmailRouteKey.CALENDAR,
            "default",
        }
    )
