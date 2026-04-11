"""RFC 5545 iCalendar (ICS) for transactional invites, updates, and cancellations.

Use a **stable** ``uid`` for the whole series (e.g. ``f\"{tenant_id}:{session_id}@yourapp\"``).
Increment ``sequence`` on every change (including cancel). For **cancellation**, set
``method=\"CANCEL\"`` and ``status=\"CANCELLED\"``; keep ``uid`` and use a ``sequence``
greater than the last invite/update you sent.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Literal, Sequence

IcsMethod = Literal["REQUEST", "CANCEL", "PUBLISH"]


def _utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def escape_ics_text(value: str) -> str:
    r"""Escape for TEXT values (RFC 5545)."""
    s = value.replace("\\", "\\\\").replace(";", r"\;").replace(",", r"\,")
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = s.replace("\n", r"\n")
    return s


def format_ics_utc(dt: datetime) -> str:
    """UTC form ``YYYYMMDDTHHMMSSZ``."""
    u = _utc(dt)
    return u.strftime("%Y%m%dT%H%M%SZ")


def _fold_content_line(name: str, value: str) -> list[str]:
    """Fold ``NAME:value`` to <=75 octets per line; continuations start with a single space."""
    raw = f"{name}:{value}".encode("utf-8")
    out: list[str] = []
    i = 0
    first = True
    while i < len(raw):
        limit = 75 if first else 74
        j = min(i + limit, len(raw))
        piece = raw[i:j]
        while j > i:
            try:
                piece.decode("utf-8")
                break
            except UnicodeDecodeError:
                j -= 1
                piece = raw[i:j]
        if j == i:
            j = i + 1
            piece = raw[i:j]
        prefix = "" if first else " "
        out.append(prefix + piece.decode("utf-8"))
        i = j
        first = False
    return out


def _param_cn(name: str) -> str:
    n = name.strip()
    if not n:
        return ""
    if any(c in n for c in ";\\,:\""):
        n = n.replace("\\", "\\\\").replace('"', r"\"")
        return f'CN="{n}"'
    return f"CN={n}"


def build_calendar_ics(
    *,
    method: IcsMethod,
    uid: str,
    sequence: int,
    dtstamp: datetime,
    dtstart: datetime,
    dtend: datetime,
    summary: str,
    description: str = "",
    location: str = "",
    organizer_email: str,
    organizer_cn: str | None = None,
    attendee_email: str,
    attendee_cn: str | None = None,
    status: str | None = None,
    url: str | None = None,
    prod_id: str = "-//STEMplitude//Calendar//EN",
) -> str:
    """Build a single-VEVENT calendar with one attendee (typical transactional invite)."""
    uid_clean = (uid or "").strip()
    org = (organizer_email or "").strip().replace("mailto:", "")
    att = (attendee_email or "").strip().replace("mailto:", "")
    if not uid_clean or not org or not att:
        raise ValueError("uid, organizer_email, and attendee_email are required")

    seq = max(0, int(sequence))
    stat = (status or "").strip().upper() or None
    if method == "CANCEL" and not stat:
        stat = "CANCELLED"

    lines: list[str] = ["BEGIN:VCALENDAR", "VERSION:2.0"]
    lines.extend(_fold_content_line("PRODID", escape_ics_text(prod_id)))
    lines.append("CALSCALE:GREGORIAN")
    lines.append(f"METHOD:{method}")
    lines.append("BEGIN:VEVENT")
    lines.extend(_fold_content_line("UID", escape_ics_text(uid_clean)))
    lines.append(f"SEQUENCE:{seq}")
    lines.extend(_fold_content_line("DTSTAMP", format_ics_utc(dtstamp)))
    lines.extend(_fold_content_line("DTSTART", format_ics_utc(dtstart)))
    lines.extend(_fold_content_line("DTEND", format_ics_utc(dtend)))
    lines.extend(
        _fold_content_line("SUMMARY", escape_ics_text(summary.strip() or "Event"))
    )
    if description.strip():
        lines.extend(
            _fold_content_line("DESCRIPTION", escape_ics_text(description.strip()))
        )
    if location.strip():
        lines.extend(_fold_content_line("LOCATION", escape_ics_text(location.strip())))
    if url and (u := url.strip()):
        lines.extend(_fold_content_line("URL", escape_ics_text(u)))

    org_cn = _param_cn(organizer_cn) if organizer_cn and organizer_cn.strip() else ""
    org_params = f";{org_cn}" if org_cn else ""
    lines.extend(_fold_content_line(f"ORGANIZER{org_params}", f"mailto:{org}"))

    att_cn = _param_cn(attendee_cn) if attendee_cn and attendee_cn.strip() else ""
    att_params = f";{att_cn}" if att_cn else ""
    att_params += ";PARTSTAT=NEEDS-ACTION;RSVP=TRUE"
    lines.extend(_fold_content_line(f"ATTENDEE{att_params}", f"mailto:{att}"))

    if stat:
        lines.append(f"STATUS:{stat}")

    lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def calendar_content_type(method: IcsMethod) -> str:
    """``Content-Type`` for the ICS MIME part (method parameter matters to clients)."""
    return f"text/calendar; charset=UTF-8; method={method}"


def suggest_calendar_filename(method: IcsMethod) -> str:
    return "cancel-event.ics" if method == "CANCEL" else "invite.ics"


_UID_SAFE = re.compile(r"[^a-zA-Z0-9@._:-]+")


def stable_event_uid(domain: str, parts: Sequence[str]) -> str:
    """Build a deterministic UID; pass tenant_id, session_id, etc. in ``parts``."""
    d = (domain or "local").strip().lower().strip(".")
    seg = ".".join(
        _UID_SAFE.sub("-", (p or "").strip()) for p in parts if (p or "").strip()
    )
    return f"{seg}@{d}" if seg else f"event@{d}"
