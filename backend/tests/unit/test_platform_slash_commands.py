"""Slash meta-commands for the platform task terminal."""

import pytest

from app.platform.slash_commands import execute_slash, parse_slash_invocation


def test_parse_non_slash():
    assert parse_slash_invocation("tenants:list") == (None, [])


def test_parse_bare_slash():
    assert parse_slash_invocation("/") == ("", [])


def test_parse_commands():
    assert parse_slash_invocation("/commands") == ("commands", [])
    assert parse_slash_invocation("  /list  ") == ("list", [])


def test_parse_help_with_domain():
    assert parse_slash_invocation("/help tenants") == ("help", ["tenants"])


def test_parse_help_question_alias():
    assert parse_slash_invocation("/?") == ("?", [])


def test_parse_quoted_args():
    assert parse_slash_invocation('/help "weird domain"') == ("help", ["weird domain"])


def test_parse_malformed():
    with pytest.raises(ValueError, match="Malformed"):
        parse_slash_invocation('/x "unclosed')


def test_execute_commands():
    out = execute_slash("commands", [])
    assert out["ok"] is True
    assert "commands" in out
    assert out["count"] == len(out["commands"])
    assert all("domain" in c and "action" in c for c in out["commands"])


def test_execute_list_alias():
    assert execute_slash("list", [])["ok"] is True


def test_execute_help_overview():
    out = execute_slash("help", [])
    assert out["ok"] is True
    assert "slash_commands" in out


def test_execute_help_domain_filter():
    out = execute_slash("help", ["tenants"])
    assert out["ok"] is True
    assert out["domain"] == "tenants"
    for c in out["commands"]:
        assert c["domain"] == "tenants"


def test_execute_unknown():
    out = execute_slash("nope", [])
    assert out["ok"] is False
    assert "error" in out
