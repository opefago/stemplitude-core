"""Unit tests for trial onboarding guardrails."""

import pytest

from app.auth.service import AuthError
from app.config import settings
from app.trials import guardrails as g

pytestmark = pytest.mark.unit


def test_normalize_email_strips_and_lowers():
    assert g.normalize_email("  Jane@EXAMPLE.COM ") == "jane@example.com"


def test_disposable_email_respects_flag(monkeypatch):
    monkeypatch.setattr(settings, "TRIAL_BLOCK_DISPOSABLE_EMAIL", False)
    assert g.disposable_email_blocked("x@mailinator.com") is False

    monkeypatch.setattr(settings, "TRIAL_BLOCK_DISPOSABLE_EMAIL", True)
    assert g.disposable_email_blocked("x@mailinator.com") is True
    assert g.disposable_email_blocked("x@example.com") is False


def test_disposable_extra_domains(monkeypatch):
    monkeypatch.setattr(settings, "TRIAL_BLOCK_DISPOSABLE_EMAIL", True)
    monkeypatch.setattr(
        settings,
        "TRIAL_DISPOSABLE_EMAIL_DOMAINS_EXTRA",
        "bad.test,other.bad",
    )
    assert g.disposable_email_blocked("a@bad.test") is True
    assert g.disposable_email_blocked("a@other.bad") is True


def test_validate_onboard_request_shape_rejects_long_email():
    long_local = "a" * 250 + "@x.co"
    with pytest.raises(AuthError, match="too long"):
        g.validate_onboard_request_shape(long_local, "A", "B")


def test_validate_onboard_request_shape_rejects_repeated_chars():
    with pytest.raises(AuthError, match="Invalid email"):
        g.validate_onboard_request_shape("a" * 20 + "@x.com", "A", "B")
