"""Slash-prefixed meta-commands for the Admin Tasks terminal (e.g. ``/commands``, ``/help``).

These are handled before ``domain:action`` parsing so operators can discover commands from the UI.
"""

from __future__ import annotations

import shlex
from typing import Any

from .registry import list_commands


def parse_slash_invocation(raw: str) -> tuple[str | None, list[str]]:
    """If ``raw`` starts with ``/``, return ``(verb, args)``; else ``(None, [])``.

    ``verb`` is lowercased. A bare ``/`` yields ``("", [])``.
    """
    s = raw.strip()
    if not s.startswith("/"):
        return (None, [])
    if s == "/":
        return ("", [])
    try:
        tokens = shlex.split(s[1:])
    except ValueError as e:
        raise ValueError(f"Malformed slash command: {e}") from e
    if not tokens:
        return ("", [])
    return (tokens[0].lower(), tokens[1:])


def execute_slash(verb: str, args: list[str]) -> dict[str, Any]:
    """Run a slash meta-command. Result dict always includes ``ok`` (registry-style)."""
    if verb in ("commands", "list"):
        cmds = list_commands()
        return {"ok": True, "commands": cmds, "count": len(cmds)}

    if verb in ("help", "?"):
        if not args:
            return {
                "ok": True,
                "title": "Admin Tasks",
                "slash_commands": [
                    "/commands — list every domain:action command (same data as GET /platform/commands)",
                    "/help — show this summary",
                    "/help <domain> — list commands for one domain (example: /help tenants)",
                ],
                "command_format": "domain:action --flag value",
                "example": 'tenants:list --active-only true',
            }
        dom = args[0].lower().strip()
        all_c = list_commands()
        filtered = [c for c in all_c if c["domain"] == dom]
        return {
            "ok": True,
            "domain": dom,
            "commands": filtered,
            "count": len(filtered),
        }

    return {
        "ok": False,
        "error": f"Unknown /{verb}. Try /help or /commands.",
    }
