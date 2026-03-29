"""Normalize Postmark / SendGrid / Resend webhook payloads into deliverability suppressions."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.email.repository import EmailSuppressionRepository
from app.email.sendgrid_event_verify import verify_sendgrid_event_signature
from app.email.unsubscribe import normalize_subscriber_email

logger = logging.getLogger(__name__)


async def apply_deliverability_suppressions(
    db: AsyncSession,
    *,
    emails: list[str],
    source: str,
) -> int:
    repo = EmailSuppressionRepository(db)
    n = 0
    for raw in emails:
        norm = normalize_subscriber_email(raw)
        if not norm:
            continue
        if await repo.record_deliverability_suppression(email_normalized=norm, source=source):
            n += 1
    return n


def parse_postmark_bounce_webhook(payload: dict[str, Any]) -> tuple[list[str], str | None]:
    """Postmark Bounce / SpamComplaint JSON. Returns (emails, source_suffix)."""
    rt = (payload.get("RecordType") or "").strip()
    email = (payload.get("Email") or "").strip()
    if not email:
        return [], None

    if rt == "SpamComplaint":
        return [email], "postmark_spam"

    if rt == "Bounce":
        btype = (payload.get("Type") or "").strip()
        if btype in ("HardBounce", "BadEmailAddress", "Blocked"):
            return [email], f"postmark_{btype.lower()}"
        return [], None

    return [], None


def _sendgrid_event_suppresses(ev: dict[str, Any]) -> bool:
    evn = (ev.get("event") or "").lower()
    if evn == "spamreport":
        return True
    if evn == "dropped":
        return True
    if evn == "bounce":
        st = str(ev.get("status") or "")
        if st.startswith("5"):
            return True
        bc = (ev.get("bounce_classification") or "").lower()
        if bc in ("invalid", "blocked"):
            return True
        # bounce "type" in some payloads
        bt = (ev.get("type") or "").lower()
        if bt == "blocked":
            return True
    return False


def parse_sendgrid_event_webhook(payload: list[Any] | dict[str, Any]) -> list[tuple[str, str]]:
    """Returns list of (email, source) for suppressions."""
    out: list[tuple[str, str]] = []
    rows = payload if isinstance(payload, list) else [payload]
    for ev in rows:
        if not isinstance(ev, dict):
            continue
        if not _sendgrid_event_suppresses(ev):
            continue
        em = (ev.get("email") or "").strip()
        if not em:
            continue
        evn = (ev.get("event") or "event").lower()
        out.append((em, f"sendgrid_{evn}"))
    return out


def parse_resend_webhook(payload: dict[str, Any]) -> tuple[list[str], str | None]:
    """Resend Svix payload after verification — ``type`` + ``data``."""
    typ = (payload.get("type") or "").strip()
    data = payload.get("data")
    if not isinstance(data, dict):
        return [], None

    src_map = {
        "email.complained": "resend_complaint",
        "email.bounced": "resend_bounce",
        "email.failed": "resend_failed",
        "email.suppressed": "resend_suppressed",
    }
    src = src_map.get(typ)
    if not src:
        return [], None

    to = data.get("to")
    emails: list[str] = []
    if isinstance(to, list):
        for x in to:
            if isinstance(x, str) and x.strip():
                emails.append(x.strip())
    elif isinstance(to, str) and to.strip():
        emails.append(to.strip())

    return emails, src


async def handle_postmark_webhook(db: AsyncSession, payload: dict[str, Any]) -> dict[str, int]:
    emails, src = parse_postmark_bounce_webhook(payload)
    if not emails or not src:
        return {"suppressed": 0}
    n = await apply_deliverability_suppressions(db, emails=emails, source=src)
    logger.info("postmark webhook suppressed=%s source=%s", n, src)
    return {"suppressed": n}


async def handle_sendgrid_webhook(db: AsyncSession, events: list[Any] | dict[str, Any]) -> dict[str, int]:
    pairs = parse_sendgrid_event_webhook(events)
    total = 0
    for em, src in pairs:
        total += await apply_deliverability_suppressions(db, emails=[em], source=src)
    if total:
        logger.info("sendgrid webhook suppressed=%s events=%s", total, len(pairs))
    return {"suppressed": total}


async def handle_resend_webhook(db: AsyncSession, payload: dict[str, Any]) -> dict[str, int]:
    emails, src = parse_resend_webhook(payload)
    if not emails or not src:
        return {"suppressed": 0}
    n = await apply_deliverability_suppressions(db, emails=emails, source=src)
    logger.info("resend webhook suppressed=%s source=%s", n, src)
    return {"suppressed": n}


def decode_json_object(body: bytes) -> dict[str, Any]:
    try:
        t = body.decode("utf-8")
    except UnicodeDecodeError:
        t = body.decode("utf-8", errors="replace")
    data = json.loads(t)
    return data if isinstance(data, dict) else {}


def decode_json_array_or_object(body: bytes) -> list[Any] | dict[str, Any]:
    try:
        t = body.decode("utf-8")
    except UnicodeDecodeError:
        t = body.decode("utf-8", errors="replace")
    data = json.loads(t)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data
    return []
