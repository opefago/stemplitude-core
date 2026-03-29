"""Parse X-Calendar-TZ before BaseHTTPMiddleware (Starlette) runs.

``BaseHTTPMiddleware`` runs the inner app in a separate task where ``ContextVar``s
set inside another ``BaseHTTPMiddleware`` dispatch often do not propagate. Pure ASGI
middleware runs in the same logical call chain first and sets a ``ContextVar`` that
child tasks inherit from the parent context snapshot.
"""

from __future__ import annotations

import logging
from urllib.parse import parse_qs

from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.calendar_tz import (
    parse_streak_calendar_tz_header,
    reset_streak_calendar_tz_context,
    set_streak_calendar_tz_context,
)

logger = logging.getLogger(__name__)


class StreakCalendarTzASGIMiddleware:
    """Set streak calendar zone from ``X-Calendar-TZ`` for the lifetime of the request."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "websocket":
            headers = Headers(scope=scope)
            ws_hdr = headers.get("x-calendar-tz")
            qs = parse_qs(scope.get("query_string", b"").decode("latin-1"))
            q_vals = qs.get("calendar_tz") or []
            q_cal = q_vals[0] if q_vals else None
            raw = ws_hdr or q_cal
            parsed = parse_streak_calendar_tz_header(raw)
            logger.debug(
                "StreakCalendarTzASGI websocket path=%s header=%r query_calendar_tz=%r parsed=%r",
                scope.get("path"),
                ws_hdr,
                q_cal,
                parsed,
            )
            token = set_streak_calendar_tz_context(parsed)
            try:
                await self.app(scope, receive, send)
            finally:
                reset_streak_calendar_tz_context(token)
            return

        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        http_headers = Headers(scope=scope)
        http_hdr = http_headers.get("x-calendar-tz")
        qs = parse_qs(scope.get("query_string", b"").decode("latin-1"))
        q_vals = qs.get("calendar_tz") or []
        q_cal = q_vals[0] if q_vals else None
        raw = http_hdr or q_cal
        parsed = parse_streak_calendar_tz_header(raw)
        logger.debug(
            "StreakCalendarTzASGI http path=%s method=%s header=%r query_calendar_tz=%r parsed=%r",
            scope.get("path"),
            scope.get("method"),
            http_hdr,
            q_cal,
            parsed,
        )
        state = scope.setdefault("state", {})
        if parsed:
            state["streak_calendar_tz"] = parsed
        else:
            state.pop("streak_calendar_tz", None)

        token = set_streak_calendar_tz_context(parsed)
        try:
            await self.app(scope, receive, send)
        finally:
            reset_streak_calendar_tz_context(token)
