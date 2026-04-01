"""Unit tests for Stripe price resolution in development."""

import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.plans import stripe_checkout as sc
from app.subscriptions.stripe_client import stripe_unix_to_aware_utc

pytestmark = pytest.mark.unit


@pytest.fixture
def plan():
    p = MagicMock()
    p.slug = "starter-center"
    p.stripe_price_id_monthly = None
    p.stripe_price_id_yearly = None
    return p


def test_uses_db_when_set(plan):
    plan.stripe_price_id_monthly = "price_from_db"
    with patch.object(sc.settings, "APP_ENV", "development"):
        assert sc.effective_stripe_price_id(plan, billing_cycle="monthly") == "price_from_db"


def test_production_skips_dev_sources(plan):
    with patch.object(sc.settings, "APP_ENV", "production"):
        assert sc.effective_stripe_price_id(plan, billing_cycle="monthly") is None


def test_dev_uses_registry_before_global_fallback(plan, tmp_path: Path, monkeypatch):
    plan.stripe_price_id_monthly = None
    reg = tmp_path / "plan_registry.json"
    reg.write_text(
        json.dumps(
            {
                "plans": [
                    {"slug": "homeschool", "stripe_price_id_monthly": "price_hs"},
                    {"slug": "starter-center", "stripe_price_id_monthly": "price_starter"},
                ]
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(sc, "_REGISTRY_PATH", reg)
    with patch.object(sc.settings, "APP_ENV", "development"):
        with patch.object(sc.settings, "STRIPE_DEV_PLAN_PRICE_MONTHLY_JSON", ""):
            with patch.object(sc.settings, "STRIPE_DEV_FALLBACK_PRICE_MONTHLY", "price_fallback"):
                assert sc.effective_stripe_price_id(plan, billing_cycle="monthly") == "price_starter"


def test_dev_uses_json_map_before_global_fallback(plan, monkeypatch):
    plan.stripe_price_id_monthly = None
    monkeypatch.setattr(sc, "_REGISTRY_PATH", Path("/nonexistent/plan_registry.json"))
    with patch.object(sc.settings, "APP_ENV", "development"):
        with patch.object(
            sc.settings,
            "STRIPE_DEV_PLAN_PRICE_MONTHLY_JSON",
            '{"starter-center":"price_map"}',
        ):
            with patch.object(sc.settings, "STRIPE_DEV_FALLBACK_PRICE_MONTHLY", "price_fallback"):
                assert sc.effective_stripe_price_id(plan, billing_cycle="monthly") == "price_map"


def test_dev_global_fallback_when_nothing_else(plan, monkeypatch):
    plan.stripe_price_id_monthly = None
    monkeypatch.setattr(sc, "_REGISTRY_PATH", Path("/nonexistent/plan_registry.json"))
    with patch.object(sc.settings, "APP_ENV", "development"):
        with patch.object(sc.settings, "STRIPE_DEV_PLAN_PRICE_MONTHLY_JSON", ""):
            with patch.object(sc.settings, "STRIPE_DEV_FALLBACK_PRICE_MONTHLY", "price_fb"):
                assert sc.effective_stripe_price_id(plan, billing_cycle="monthly") == "price_fb"


def test_dev_checkout_uses_price_data_from_plan_list_price(plan, monkeypatch):
    """Without catalog Price IDs, dev checkout uses plan.price_* so amounts differ per plan."""
    plan.stripe_price_id_monthly = None
    plan.slug = "no-catalog-slug"
    plan.name = "Test plan"
    plan.price_monthly = 29.99
    monkeypatch.setattr(sc, "_REGISTRY_PATH", Path("/nonexistent/plan_registry.json"))
    with patch.object(sc.settings, "APP_ENV", "development"):
        with patch.object(sc.settings, "STRIPE_DEV_PLAN_PRICE_MONTHLY_JSON", ""):
            with patch.object(sc.settings, "STRIPE_DEV_FALLBACK_PRICE_MONTHLY", ""):
                line_item, err = sc.subscription_checkout_line_item(plan, billing_cycle="monthly")
    assert err is None
    assert line_item is not None
    assert line_item.get("price_data", {}).get("unit_amount") == 2999
    assert line_item.get("price_data", {}).get("recurring", {}).get("interval") == "month"


def test_stripe_unix_to_aware_utc():
    assert stripe_unix_to_aware_utc(None) is None
    assert stripe_unix_to_aware_utc(1700000000).year == 2023
    dt = datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
    assert stripe_unix_to_aware_utc(dt) == dt
    naive = datetime(2024, 1, 2, 3, 4, 5)
    out = stripe_unix_to_aware_utc(naive)
    assert out.tzinfo == timezone.utc
