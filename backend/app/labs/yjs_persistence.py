"""Yjs room persistence — store Y.Doc binary state in PostgreSQL.

Each Yjs room (identified by its room_name string) has its full document
state encoded as a binary blob and saved to the ``yjs_rooms`` table.

Saves are debounced: rapid consecutive updates (e.g. live dragging objects)
coalesce into a single DB write after a short idle window.
"""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from sqlalchemy import text

from app.database import async_session_factory

if TYPE_CHECKING:
    from pycrdt import Doc as YDoc

logger = logging.getLogger(__name__)

# Debounce delay in seconds — saves are deferred this long after the last update.
_DEBOUNCE_S = 2.0

# Active debounce tasks keyed by room_name.
_pending: dict[str, asyncio.TimerHandle] = {}


# ─── Public API ───────────────────────────────────────────────────────────────

async def load_room_state(room_name: str) -> bytes | None:
    """Return the persisted binary state for *room_name*, or None if not found."""
    async with async_session_factory() as db:
        result = await db.execute(
            text("SELECT encoded_state FROM yjs_rooms WHERE room_name = :n"),
            {"n": room_name},
        )
        row = result.first()
        return bytes(row[0]) if row else None


async def schedule_save(room_name: str, ydoc: "YDoc") -> None:
    """Debounced save: cancel any pending save for this room and reschedule."""
    loop = asyncio.get_running_loop()

    existing = _pending.pop(room_name, None)
    if existing:
        existing.cancel()

    handle = loop.call_later(
        _DEBOUNCE_S,
        lambda: asyncio.create_task(_do_save(room_name, ydoc)),
    )
    _pending[room_name] = handle


async def flush_room(room_name: str, ydoc: "YDoc") -> None:
    """Immediately persist the room without waiting for the debounce window.

    Call this on clean shutdown to avoid data loss.
    """
    existing = _pending.pop(room_name, None)
    if existing:
        existing.cancel()
    await _do_save(room_name, ydoc)


# ─── Internal ─────────────────────────────────────────────────────────────────

async def _do_save(room_name: str, ydoc: "YDoc") -> None:
    _pending.pop(room_name, None)
    try:
        # Doc.get_update() returns the full document state as a binary update.
        state: bytes = ydoc.get_update()
    except Exception:
        logger.warning("Yjs persistence: failed to encode room %s", room_name, exc_info=True)
        return

    try:
        async with async_session_factory() as db:
            await db.execute(
                text("""
                    INSERT INTO yjs_rooms (room_name, encoded_state, updated_at)
                    VALUES (:n, :s, now())
                    ON CONFLICT (room_name)
                    DO UPDATE SET encoded_state = EXCLUDED.encoded_state,
                                  updated_at    = now()
                """),
                {"n": room_name, "s": state},
            )
            await db.commit()
        logger.debug("Yjs persistence: saved room %s (%d bytes)", room_name, len(state))
    except Exception:
        logger.warning("Yjs persistence: DB write failed for room %s", room_name, exc_info=True)
