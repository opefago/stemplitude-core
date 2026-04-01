"""Parse the hybrid command format: domain:action --flag value -s short_val.

Security: This parser only extracts tokens. Validation is done by the registry.
No shell metacharacters or injection vectors are possible because we never
pass anything to a shell -- it's all dict lookups and Python function calls.
"""

from __future__ import annotations

import re
import shlex


_COMMAND_RE = re.compile(r"^([a-z][a-z0-9_-]*):([a-z][a-z0-9_-]*)$")


class ParseError(Exception):
    pass


def parse_command(raw: str) -> tuple[str, dict[str, str]]:
    """Parse 'domain:action --flag value ...' into (command_key, params_dict).

    Returns:
        ("domain:action", {"flag": "value", ...})

    Raises:
        ParseError on malformed input.
    """
    raw = raw.strip()
    if not raw:
        raise ParseError("Empty command")

    try:
        tokens = shlex.split(raw)
    except ValueError as e:
        raise ParseError(f"Malformed input: {e}") from e

    if not tokens:
        raise ParseError("Empty command")

    cmd_token = tokens[0]
    match = _COMMAND_RE.match(cmd_token)
    if not match:
        raise ParseError(
            f"Invalid command format: '{cmd_token}'. "
            "Expected 'domain:action' (lowercase, alphanumeric, hyphens). "
            "Type /commands in this terminal to list commands, or /help for usage."
        )

    command_key = cmd_token
    params: dict[str, str] = {}
    i = 1
    while i < len(tokens):
        token = tokens[i]
        if token.startswith("-"):
            flag = token
            if i + 1 < len(tokens) and not tokens[i + 1].startswith("-"):
                params[flag] = tokens[i + 1]
                i += 2
            else:
                params[flag] = "true"
                i += 1
        else:
            raise ParseError(
                f"Unexpected positional argument: '{token}'. "
                "Use --flag value format."
            )

    return command_key, params
