"""Unit tests for Stripe invoice subscription id resolution."""

import pytest

from app.subscriptions import stripe_invoice_sync as sis

pytestmark = pytest.mark.unit


def test_stripe_invoice_subscription_id_top_level():
    assert sis.stripe_invoice_subscription_id({"subscription": "sub_abc"}) == "sub_abc"


def test_stripe_invoice_subscription_id_parent_details():
    inv = {
        "id": "in_1",
        "parent": {"subscription_details": {"subscription": "sub_xyz"}},
    }
    assert sis.stripe_invoice_subscription_id(inv) == "sub_xyz"


def test_stripe_invoice_subscription_id_missing():
    assert sis.stripe_invoice_subscription_id({"id": "in_1"}) is None
