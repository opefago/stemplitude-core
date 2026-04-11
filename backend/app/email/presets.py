"""Typed, themed transactional email builders (verify, OTP, welcome, reminders, security, notifications).

These return :class:`app.email.catalog.PreparedTransactionalEmail` for
:func:`app.email.outbox.enqueue_transactional_email`. **Auth OTP/verify** still need API wiring;
**invitations** use :func:`build_invitation_email` from :mod:`app.invitations.service`.

Boundaries & follow-ups
-----------------------
- **i18n**: English-only copy in presets; add locale-aware strings when you ship multiple languages.
- **Per-tenant branding**: :class:`app.email.templates.EmailTheme` is global (``EMAIL_THEME_*``);
  school-specific logos/colors would need tenant DB fields + CDN URLs.
- **ICS / calendar**: ``text/calendar`` attachments (invite, update, cancel) are supported end-to-end
  (see :mod:`app.email.ics` and :func:`build_calendar_event_email`). Persist a stable ``event_uid`` and
  a monotonic ``sequence`` per series; for **updates** resend with a higher ``sequence`` and
  ``method=\"REQUEST\"``; for **cancellation** use ``method=\"CANCEL\"`` and a ``sequence`` greater
  than the last published revision.
- **Optional mail** (invites, classroom, notifications): signed footer unsubscribe + ``List-Unsubscribe``
  one-click when ``EMAIL_PUBLIC_BASE_URL`` is set; suppressions in ``email_suppressions``.
  **Critical** routes (verify, OTP, password reset, security) always send and omit one-click headers.
- **AMP / second HTML part**: not implemented; providers receive plain text plus a single HTML part.
- **Rate limits & idempotency**: throttle and dedupe sensitive sends in the API; provider-level
  idempotency keys (e.g. Resend headers) are not wired in this stack.
- **SMS OTP**: not covered here.

For **digest** or multi-item notifications, compose with :class:`app.email.templates.EmailBodyBuilder`
(``bullet_list``, ``data_table``) and wrap in :class:`app.email.templates.TransactionalEmailBuilder`.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from app.config import settings
from app.email.attachments import EmailAttachment
from app.email import ics as ics_builder
from app.email.catalog import EmailRouteKey, PreparedTransactionalEmail
from app.email.templates import (
    EmailBodyBuilder,
    EmailTheme,
    TransactionalEmailBuilder,
    app_absolute_url,
    email_theme_from_settings,
    esc,
    paragraphs_from_plain,
)


def _theme(theme: EmailTheme | None) -> EmailTheme:
    return theme if theme is not None else email_theme_from_settings()


def _app_name() -> str:
    return (settings.APP_NAME or "Stemplitude").strip()


def build_invitation_email(
    *,
    subject: str,
    invite_link: str,
    inviter_name: str,
    tenant_name: str,
    role_or_desc: str,
    recipient_first_name: str | None = None,
    personal_message: str | None = None,
    expires_days: int = 7,
    theme: EmailTheme | None = None,
) -> PreparedTransactionalEmail:
    """Tenant user or parent invitation (accept link + expiry footnote)."""
    th = _theme(theme)
    greeting = f"Hi {recipient_first_name}" if (recipient_first_name or "").strip() else "Hi"
    inner = (
        EmailBodyBuilder(theme=th)
        .paragraph(f"{greeting},")
        .raw_html(
            f'<p style="margin:0 0 16px 0;font-size:{th.font_size_body};line-height:{th.line_height_body};'
            f"color:{th.color_body};font-family:{th.font_stack};\">"
            f"<strong>{esc(inviter_name)}</strong> has invited you to join "
            f"<strong>{esc(tenant_name)}</strong> as {esc(role_or_desc)}.</p>"
        )
        .build_html()
    )
    footnote_html = (
        esc(f"This invitation expires in {expires_days} days.")
        + "<br /><br />"
        + esc("If you did not expect this invitation, you can ignore this email.")
    )
    note_plain = (
        f"\n\nNote from {inviter_name}:\n{(personal_message or '').strip()}\n"
        if (personal_message or "").strip()
        else ""
    )
    plain_body = (
        f"{greeting},\n\n"
        f"{inviter_name} has invited you to join {tenant_name} as {role_or_desc}."
        f"{note_plain}"
    )
    msg = (
        TransactionalEmailBuilder(theme=th)
        .headline(subject)
        .preheader(f"{inviter_name} invited you to {tenant_name}")
        .inner_html(inner)
        .plain_body(plain_body)
        .primary_action(invite_link, "Accept invitation")
        .mirror_primary_as_text_link()
        .footnote_html(footnote_html)
        .footnote_plain(
            f"This invitation expires in {expires_days} days.\n\n"
            "If you did not expect this invitation, you can ignore this email."
        )
        .footer_category("Invitation")
        .compliance_route_key(EmailRouteKey.INVITE)
        .build()
    )
    return PreparedTransactionalEmail(
        subject=subject,
        message=msg,
        route_key=EmailRouteKey.INVITE,
        footer_category="Invitation",
    )


def build_email_verification_email(
    *,
    verify_url: str,
    expires_hours: int = 24,
    recipient_first_name: str | None = None,
    theme: EmailTheme | None = None,
) -> PreparedTransactionalEmail:
    """Confirm-email link (registration or email change)."""
    th = _theme(theme)
    app = _app_name()
    greeting = f"Hi {recipient_first_name}" if (recipient_first_name or "").strip() else "Hi"
    subject = f"Confirm your email — {app}"
    inner = (
        EmailBodyBuilder(theme=th)
        .paragraph(f"{greeting},")
        .paragraph(f"Please confirm your email address for your {app} account.")
        .security_callout(
            f"This link expires in {expires_hours} hours. If you did not create an account, "
            "you can ignore this email."
        )
        .build_html()
    )
    plain_body = (
        f"{greeting},\n\nPlease confirm your email for {app}.\n\n"
        f"The confirmation link expires in {expires_hours} hours.\n\n"
        "If you did not create an account, ignore this email."
    )
    msg = (
        TransactionalEmailBuilder(theme=th)
        .headline("Confirm your email")
        .preheader(f"Verify your address for {app}")
        .inner_html(inner)
        .plain_body(plain_body)
        .primary_action(verify_url, "Confirm email")
        .mirror_primary_as_text_link()
        .footer_category("Email verification")
        .compliance_route_key(EmailRouteKey.AUTH_VERIFY)
        .build()
    )
    return PreparedTransactionalEmail(
        subject=subject,
        message=msg,
        route_key=EmailRouteKey.AUTH_VERIFY,
        footer_category="Email verification",
    )


def build_password_reset_email(
    *,
    reset_url: str,
    expires_hours: int = 1,
    recipient_first_name: str | None = None,
    theme: EmailTheme | None = None,
) -> PreparedTransactionalEmail:
    """Password reset deep link."""
    th = _theme(theme)
    app = _app_name()
    greeting = f"Hi {recipient_first_name}" if (recipient_first_name or "").strip() else "Hi"
    subject = f"Reset your password — {app}"
    inner = (
        EmailBodyBuilder(theme=th)
        .paragraph(f"{greeting},")
        .paragraph("We received a request to reset your password.")
        .security_callout(
            f"This link expires in {expires_hours} hour(s). If you did not ask for a reset, "
            "ignore this email — your password will stay the same."
        )
        .build_html()
    )
    plain_body = (
        f"{greeting},\n\nReset your password for {app}.\n\n"
        f"The reset link expires in {expires_hours} hour(s).\n\n"
        "If you did not request this, ignore this email."
    )
    msg = (
        TransactionalEmailBuilder(theme=th)
        .headline("Reset your password")
        .preheader(f"Password reset for {app}")
        .inner_html(inner)
        .plain_body(plain_body)
        .primary_action(reset_url, "Reset password")
        .mirror_primary_as_text_link()
        .footer_category("Password reset")
        .compliance_route_key(EmailRouteKey.AUTH_PASSWORD_RESET)
        .build()
    )
    return PreparedTransactionalEmail(
        subject=subject,
        message=msg,
        route_key=EmailRouteKey.AUTH_PASSWORD_RESET,
        footer_category="Password reset",
    )


def build_otp_email(
    *,
    code: str,
    purpose: str = "sign-in",
    expires_minutes: int = 10,
    theme: EmailTheme | None = None,
) -> PreparedTransactionalEmail:
    """One-time code (no link CTA). ``purpose`` is a short phrase for the opening line."""
    th = _theme(theme)
    app = _app_name()
    purpose_clean = (purpose or "verification").strip().lower()
    subject = f"Your verification code — {app}"
    inner = (
        EmailBodyBuilder(theme=th)
        .paragraph(f"Use this code to complete {purpose_clean}:")
        .otp_code(code)
        .muted(f"Code expires in {expires_minutes} minutes.")
        .security_callout(
            "Never share this code with anyone. Our team will never ask you for it."
        )
        .build_html()
    )
    plain_body = (
        f"Your {app} verification code (expires in {expires_minutes} minutes):\n\n"
        f"{code.strip()}\n\n"
        "Never share this code. We will never ask you for it."
    )
    msg = (
        TransactionalEmailBuilder(theme=th)
        .headline("Your verification code")
        .preheader(f"{expires_minutes}-minute code for {app}")
        .inner_html(inner)
        .plain_body(plain_body)
        .footer_category("One-time code")
        .compliance_route_key(EmailRouteKey.AUTH_OTP)
        .build()
    )
    return PreparedTransactionalEmail(
        subject=subject,
        message=msg,
        route_key=EmailRouteKey.AUTH_OTP,
        footer_category="One-time code",
    )


def build_welcome_email(
    *,
    display_name: str | None = None,
    dashboard_path: str = "/app",
    theme: EmailTheme | None = None,
) -> PreparedTransactionalEmail:
    """Post-signup welcome with optional CTA to the app."""
    th = _theme(theme)
    app = _app_name()
    name = (display_name or "").strip()
    greeting = f"Hi {name}" if name else "Hi"
    url = app_absolute_url(dashboard_path if dashboard_path.startswith("/") else f"/{dashboard_path}")
    subject = f"Welcome to {app}"
    inner = (
        EmailBodyBuilder(theme=th)
        .paragraph(f"{greeting},")
        .paragraph(f"Your {app} account is ready. You can sign in any time to pick up where you left off.")
        .build_html()
    )
    plain_body = f"{greeting},\n\nWelcome to {app}. Your account is ready."
    msg = (
        TransactionalEmailBuilder(theme=th)
        .headline(f"Welcome to {app}")
        .preheader(f"Your account is ready")
        .inner_html(inner)
        .plain_body(plain_body)
        .primary_action(url, "Go to dashboard")
        .mirror_primary_as_text_link()
        .footer_category("Welcome")
        .build()
    )
    return PreparedTransactionalEmail(
        subject=subject,
        message=msg,
        route_key=EmailRouteKey.ONBOARDING_WELCOME,
        footer_category="Welcome",
    )


def build_reminder_email(
    *,
    subject: str,
    headline: str,
    body_paragraphs: list[str],
    action_url: str,
    action_label: str = "Open",
    preheader: str | None = None,
    theme: EmailTheme | None = None,
) -> PreparedTransactionalEmail:
    """Generic reminder (assignments, renewals, incomplete setup)."""
    th = _theme(theme)
    b = EmailBodyBuilder(theme=th)
    for p in body_paragraphs:
        b.paragraph(p)
    inner = b.build_html()
    plain_body = "\n\n".join((x or "").strip() for x in body_paragraphs if (x or "").strip())
    msg = (
        TransactionalEmailBuilder(theme=th)
        .headline(headline)
        .preheader(preheader or headline)
        .inner_html(inner)
        .plain_body(plain_body)
        .primary_action(action_url, action_label)
        .mirror_primary_as_text_link()
        .footer_category("Reminder")
        .compliance_route_key(EmailRouteKey.REMINDER)
        .build()
    )
    return PreparedTransactionalEmail(
        subject=subject.strip(),
        message=msg,
        route_key=EmailRouteKey.REMINDER,
        footer_category="Reminder",
    )


def build_security_notice_email(
    *,
    subject: str,
    headline: str,
    body_paragraphs: list[str],
    action_url: str | None = None,
    action_label: str | None = None,
    preheader: str | None = None,
    theme: EmailTheme | None = None,
) -> PreparedTransactionalEmail:
    """Account / device / password change notices."""
    th = _theme(theme)
    b = EmailBodyBuilder(theme=th)
    for p in body_paragraphs:
        b.paragraph(p)
    b.security_callout(
        "If this was not you, secure your account immediately: change your password and contact support."
    )
    inner = b.build_html()
    lines = [p.strip() for p in body_paragraphs if (p or "").strip()]
    plain_body = "\n\n".join(lines)
    plain_body += (
        "\n\nIf this was not you, secure your account immediately.\n"
        "Change your password and contact support."
    )
    url = (action_url or "").strip()
    label = (action_label or "").strip()
    if url and label:
        plain_body += f"\n\n{label}: {url}"

    tb = (
        TransactionalEmailBuilder(theme=th)
        .headline(headline)
        .preheader(preheader or headline)
        .inner_html(inner)
        .plain_body(plain_body)
        .footer_category("Security")
        .compliance_route_key(EmailRouteKey.SECURITY)
    )
    if url and label:
        tb = tb.primary_action(url, label).mirror_primary_as_text_link()
    msg = tb.build()

    return PreparedTransactionalEmail(
        subject=subject.strip(),
        message=msg,
        route_key=EmailRouteKey.SECURITY,
        footer_category="Security",
    )


def build_notification_email(
    *,
    subject: str,
    headline: str,
    summary: str,
    action_url: str,
    action_label: str = "View in app",
    preheader: str | None = None,
    theme: EmailTheme | None = None,
) -> PreparedTransactionalEmail:
    """Single high-signal in-app style notification by email (enrollment-style, generic path)."""
    th = _theme(theme)
    inner = EmailBodyBuilder(theme=th).paragraph(summary.strip()).build_html()
    plain_body = summary.strip()
    msg = (
        TransactionalEmailBuilder(theme=th)
        .headline(headline.strip())
        .preheader((preheader or summary or headline).strip())
        .inner_html(inner)
        .plain_body(plain_body)
        .primary_action(action_url.strip(), action_label)
        .mirror_primary_as_text_link()
        .footer_category("Notification")
        .compliance_route_key(EmailRouteKey.NOTIFICATION)
        .build()
    )
    return PreparedTransactionalEmail(
        subject=subject.strip(),
        message=msg,
        route_key=EmailRouteKey.NOTIFICATION,
        footer_category="Notification",
    )


def _prepared_simple_transactional(
    *,
    subject: str,
    headline: str,
    preheader: str,
    summary_line: str,
    action_url: str,
    action_label: str,
    route_key: str,
    footer_category: str,
    theme: EmailTheme | None = None,
    attachments: tuple[EmailAttachment, ...] = (),
) -> PreparedTransactionalEmail:
    th = _theme(theme)
    s = summary_line.strip()
    inner = EmailBodyBuilder(theme=th).paragraph(s).build_html()
    msg = (
        TransactionalEmailBuilder(theme=th)
        .headline(headline.strip())
        .preheader(preheader.strip())
        .inner_html(inner)
        .plain_body(s)
        .primary_action(action_url.strip(), action_label)
        .mirror_primary_as_text_link()
        .footer_category(footer_category)
        .compliance_route_key(route_key)
        .build()
    )
    return PreparedTransactionalEmail(
        subject=subject.strip(),
        message=msg,
        route_key=route_key,
        footer_category=footer_category,
        attachments=attachments,
    )


def build_classroom_enrollment_email(
    *,
    classroom_id: UUID | str,
    classroom_display_name: str,
    student_first_name: str | None,
    added: bool,
    theme: EmailTheme | None = None,
) -> PreparedTransactionalEmail:
    """Student/parent class add/remove notice (same payload for each recipient)."""
    action = "added to" if added else "removed from"
    short = classroom_display_name.strip() or "a class"
    subject = f"Class enrollment update: {short}"
    who = student_first_name or "A student"
    body_line = f"{who} was {action} {short}."
    return _prepared_simple_transactional(
        subject=subject,
        headline=subject,
        preheader=body_line,
        summary_line=body_line,
        action_url=app_absolute_url(f"/app/classrooms/{classroom_id}"),
        action_label="Open class in app",
        route_key=EmailRouteKey.CLASSROOM_ENROLLMENT,
        footer_category="Class enrollment",
        theme=theme,
    )


def build_classroom_session_content_email(
    *,
    classroom_id: UUID | str,
    title: str,
    body: str,
    theme: EmailTheme | None = None,
) -> PreparedTransactionalEmail:
    """New resources added to a session (email to student when student email exists)."""
    t, b = title.strip(), body.strip()
    return _prepared_simple_transactional(
        subject=t,
        headline=t,
        preheader=b,
        summary_line=b,
        action_url=app_absolute_url(f"/app/classrooms/{classroom_id}"),
        action_label="Open class in app",
        route_key=EmailRouteKey.CLASSROOM_SESSION_CONTENT,
        footer_category="Class materials",
        theme=theme,
    )


def build_classroom_submission_email(
    *,
    classroom_id: UUID | str,
    email_subject: str,
    summary_plain: str,
    theme: EmailTheme | None = None,
) -> PreparedTransactionalEmail:
    """Instructor notification: new submission."""
    s = email_subject.strip()
    p = summary_plain.strip()
    return _prepared_simple_transactional(
        subject=s,
        headline=s,
        preheader=p,
        summary_line=p,
        action_url=app_absolute_url(f"/app/classrooms/{classroom_id}?tab=submissions"),
        action_label="Review submission in app",
        route_key=EmailRouteKey.CLASSROOM_SUBMISSION,
        footer_category="Assignment submission",
        theme=theme,
    )


def build_classroom_grading_email(
    *,
    classroom_id: UUID | str,
    email_subject: str,
    body_plain: str,
    cta_label: str,
    theme: EmailTheme | None = None,
) -> PreparedTransactionalEmail:
    """Student or parent: graded work available."""
    subj = email_subject.strip()
    body = body_plain.strip()
    return _prepared_simple_transactional(
        subject=subj,
        headline=subj,
        preheader=body,
        summary_line=body,
        action_url=app_absolute_url(f"/app/classrooms/{classroom_id}?tab=assignments"),
        action_label=cta_label,
        route_key=EmailRouteKey.CLASSROOM_GRADING,
        footer_category="Grading",
        theme=theme,
    )


def build_calendar_event_email(
    *,
    event_uid: str,
    sequence: int,
    summary: str,
    dtstart: datetime,
    dtend: datetime,
    organizer_email: str,
    attendee_email: str,
    action_url: str,
    method: Literal["REQUEST", "CANCEL"] = "REQUEST",
    description: str = "",
    location: str = "",
    organizer_name: str | None = None,
    attendee_name: str | None = None,
    action_label: str = "Open in app",
    subject: str | None = None,
    headline: str | None = None,
    preheader: str | None = None,
    summary_line: str | None = None,
    meeting_url: str | None = None,
    theme: EmailTheme | None = None,
) -> PreparedTransactionalEmail:
    """Transactional message plus ICS (invite/update with ``REQUEST``, or ``CANCEL`` for removal).

    Use the same ``event_uid`` for the lifetime of the event. Increment ``sequence`` on every
    change, including the cancel message (must be greater than the last invite/update).
    """
    summ = summary.strip() or "Event"
    desc = description.strip()
    if meeting_url and meeting_url.strip():
        url_line = meeting_url.strip()
        desc = f"{desc}\n\n{url_line}" if desc else url_line
    loc = location.strip()
    now = datetime.now(timezone.utc)
    ics_body = ics_builder.build_calendar_ics(
        method=method,
        uid=event_uid.strip(),
        sequence=sequence,
        dtstamp=now,
        dtstart=dtstart,
        dtend=dtend,
        summary=summ,
        description=desc,
        location=loc,
        organizer_email=organizer_email.strip(),
        organizer_cn=organizer_name,
        attendee_email=attendee_email.strip(),
        attendee_cn=attendee_name,
        url=meeting_url.strip() if meeting_url else None,
    )
    att = EmailAttachment.from_utf8_text(
        filename=ics_builder.suggest_calendar_filename(method),
        content_type=ics_builder.calendar_content_type(method),
        text=ics_body,
    )
    if method == "CANCEL":
        subj = subject or f"Canceled: {summ}"
        head = headline or "Event canceled"
        pre = preheader or f"{summ} has been canceled."
        body_line = summary_line or pre
    else:
        subj = subject or summ
        head = headline or summ
        pre = preheader or desc or summ
        body_line = summary_line or (desc or summ)
    return _prepared_simple_transactional(
        subject=subj,
        headline=head,
        preheader=pre,
        summary_line=body_line,
        action_url=action_url,
        action_label=action_label,
        route_key=EmailRouteKey.CALENDAR,
        footer_category="Calendar",
        theme=theme,
        attachments=(att,),
    )