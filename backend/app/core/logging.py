"""Centralized logging configuration with PII masking.

All log output is automatically filtered through ``PIIFilter`` which
redacts emails and phone numbers before they reach any handler.  For
explicit masking in log call sites, use the ``mask_email`` helper.
"""

import logging
import re
import sys

from app.config import settings

_EMAIL_RE = re.compile(
    r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+",
)
_PHONE_RE = re.compile(
    r"(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}",
)


def mask_email(email: str) -> str:
    """Partially redact an email for safe logging.

    ``jane.doe@example.com`` → ``j***@e***.com``
    """
    if not email or "@" not in email:
        return "***"
    local, domain = email.rsplit("@", 1)
    parts = domain.rsplit(".", 1)
    masked_local = local[0] + "***" if local else "***"
    masked_domain = parts[0][0] + "***" if parts[0] else "***"
    tld = parts[1] if len(parts) > 1 else ""
    return f"{masked_local}@{masked_domain}.{tld}"


def mask_value(value: str) -> str:
    """Generic partial redaction: show first and last char, mask the rest.

    ``alex_rivera`` → ``a**********a``
    """
    if not value:
        return "***"
    if len(value) <= 2:
        return value[0] + "*"
    return value[0] + "*" * (len(value) - 2) + value[-1]


def _mask_email_match(m: re.Match) -> str:
    return mask_email(m.group(0))


def _mask_phone_match(m: re.Match) -> str:
    digits = re.sub(r"\D", "", m.group(0))
    if len(digits) < 7:
        return m.group(0)
    return digits[:2] + "*" * (len(digits) - 4) + digits[-2:]


def mask_pii(text: str) -> str:
    """Apply all PII masking rules to a string."""
    text = _EMAIL_RE.sub(_mask_email_match, text)
    text = _PHONE_RE.sub(_mask_phone_match, text)
    return text


class PIIFilter(logging.Filter):
    """Logging filter that redacts PII patterns from log messages.

    Automatically applied to the root logger by ``setup_logging()``.
    Catches emails and phone numbers that slip into log messages even
    when developers forget to mask them explicitly.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    k: mask_pii(str(v)) if isinstance(v, str) else v
                    for k, v in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    mask_pii(str(a)) if isinstance(a, str) else a
                    for a in record.args
                )
        if isinstance(record.msg, str):
            record.msg = mask_pii(record.msg)
        return True


def setup_logging() -> None:
    """Configure structured logging for the application.

    - DEBUG level in development, INFO in production
    - Consistent format with timestamp, level, module, and message
    - Suppresses noisy third-party loggers
    - Attaches ``PIIFilter`` to the root logger for automatic redaction
    """
    level = logging.DEBUG if settings.is_development else logging.INFO

    fmt = "%(asctime)s %(levelname)-8s [%(name)s] %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"

    logging.basicConfig(
        level=level,
        format=fmt,
        datefmt=datefmt,
        stream=sys.stdout,
        force=True,
    )

    root = logging.getLogger()
    root.addFilter(PIIFilter())

    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.WARNING if not settings.DEBUG else logging.INFO
    )
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("boto3").setLevel(logging.WARNING)
    logging.getLogger("botocore").setLevel(logging.WARNING)
    logging.getLogger("celery").setLevel(logging.INFO)
