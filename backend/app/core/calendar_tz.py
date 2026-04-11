"""Streak calendar zone for the current HTTP request or WebSocket.

Resolved from (in order): ``X-Calendar-TZ`` header, then ``calendar_tz`` query param
(browsers cannot set custom headers on ``WebSocket`` — use the query param on the WS URL).

1. **FastAPI dependency** (``streak_calendar_tz_dependency``) — bound for each HTTP
   request and WebSocket connection. Same asyncio task as route bodies and
   ``bump_student_streak``, so streak updates see the client zone.

2. **Pure ASGI middleware** (``StreakCalendarTzASGIMiddleware``) — sets the same
   ``ContextVar`` for HTTP and WebSocket as a fallback before inner middleware tasks.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextvars import ContextVar, Token

from starlette.requests import HTTPConnection
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

_streak_calendar_tz_ctx: ContextVar[str | None] = ContextVar(
    "streak_calendar_tz",
    default=None,
)

# Set by FastAPI app-level dependency for the lifetime of each HTTP/WebSocket handler.
_fastapi_streak_calendar_tz: ContextVar[str | None] = ContextVar(
    "fastapi_streak_calendar_tz",
    default=None,
)


def parse_streak_calendar_tz_header(raw: str | None) -> str | None:
    if not raw or not str(raw).strip():
        return None
    name = str(raw).strip()
    try:
        ZoneInfo(name)
    except Exception:
        return None
    return name


def set_streak_calendar_tz_context(tz: str | None) -> Token:
    return _streak_calendar_tz_ctx.set(tz)


def reset_streak_calendar_tz_context(token: Token) -> None:
    _streak_calendar_tz_ctx.reset(token)


def get_optional_request_calendar_tz() -> str | None:
    """IANA zone from the inbound request, if valid."""
    tz = _fastapi_streak_calendar_tz.get()
    if tz:
        return tz
    tz = _streak_calendar_tz_ctx.get()
    return tz if tz else None


async def streak_calendar_tz_dependency(
    conn: HTTPConnection,
) -> AsyncIterator[None]:
    """Bind streak calendar zone for this HTTP request or WebSocket.

    Browsers cannot set custom headers on ``WebSocket``; pass ``calendar_tz`` as a
    query param on the WS URL (same IANA name as ``X-Calendar-TZ`` on HTTP).
    """
    scope_type = getattr(conn, "scope", None)
    st = scope_type.get("type") if isinstance(scope_type, dict) else None
    path = scope_type.get("path") if isinstance(scope_type, dict) else None
    header_raw = conn.headers.get("x-calendar-tz")
    qp = conn.query_params.get("calendar_tz")
    query_raw = qp.strip() if qp else None
    raw = header_raw or query_raw
    parsed = parse_streak_calendar_tz_header(raw)
    if raw and not parsed:
        logger.debug(
            "streak_calendar_tz_dependency: invalid IANA zone raw=%r scope_type=%s path=%s",
            raw,
            st,
            path,
        )
    else:
        logger.debug(
            "streak_calendar_tz_dependency: scope_type=%s path=%s header=%r query=%r parsed=%r",
            st,
            path,
            header_raw,
            query_raw,
            parsed,
        )
    token = _fastapi_streak_calendar_tz.set(parsed)
    try:
        yield
    finally:
        _fastapi_streak_calendar_tz.reset(token)
