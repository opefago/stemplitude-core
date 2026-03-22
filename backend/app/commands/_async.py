"""Async helper for Typer commands."""

import asyncio
import functools
from collections.abc import Callable, Coroutine
from typing import Any


def async_command(func: Callable[..., Coroutine[Any, Any, Any]]) -> Callable[..., Any]:
    """Decorator that lets Typer run an ``async def`` command."""

    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        return asyncio.run(func(*args, **kwargs))

    return wrapper
