"""Async SQLAlchemy helpers for Celery prefork workers."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import TypeVar

import app.database as _db

logger = logging.getLogger(__name__)

T = TypeVar("T")


def run_async_db(factory: Callable[[], Awaitable[T]]) -> T:
    """Run DB coroutine work under ``asyncio.run`` in a worker child process.

    Each ``asyncio.run()`` uses a new event loop. Rebind ``app.database`` to a
    short-lived engine (``NullPool`` for Postgres) for the duration of the
    coroutine so asyncpg never reuses connections across loops.
    """
    async def _runner() -> T:
        # Global redis client is bound to whatever loop first created it; each
        # ``asyncio.run()`` uses a new loop.
        try:
            import app.core.redis as _redis_mod

            _redis_mod.redis_client = None
        except Exception:
            logger.debug("redis client reset skipped", exc_info=True)

        task_engine, task_sessionmaker = _db.create_loop_local_async_engine_and_sessionmaker()
        prev_engine = _db.engine
        prev_factory = _db.async_session_factory
        _db.engine = task_engine
        _db.async_session_factory = task_sessionmaker
        try:
            return await factory()
        finally:
            try:
                await task_engine.dispose()
            except Exception:
                logger.debug("task_engine.dispose failed", exc_info=True)
            _db.engine = prev_engine
            _db.async_session_factory = prev_factory

    return asyncio.run(_runner())
