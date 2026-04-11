"""Tests for mapping Stripe subscription payloads onto local Subscription rows."""

from datetime import datetime, timezone
from uuid import uuid4

from app.subscriptions.models import Subscription
from app.subscriptions.stripe_subscription_sync import apply_stripe_subscription_payload_to_local


def test_apply_payload_from_dict_sets_periods():
    sub = Subscription(
        id=uuid4(),
        tenant_id=uuid4(),
        user_id=uuid4(),
        plan_id=uuid4(),
        status="active",
        provider="stripe",
        stripe_subscription_id="sub_test",
    )
    # Stripe API JSON uses unix seconds (snake_case keys)
    payload = {
        "id": "sub_test",
        "status": "active",
        "current_period_start": 1700000000,
        "current_period_end": 1702678400,
        "trial_end": None,
        "canceled_at": None,
    }
    apply_stripe_subscription_payload_to_local(sub, payload)
    assert sub.status == "active"
    assert sub.current_period_start == datetime.fromtimestamp(1700000000, tz=timezone.utc)
    assert sub.current_period_end == datetime.fromtimestamp(1702678400, tz=timezone.utc)
    assert sub.trial_end is None


def test_apply_payload_trialing_with_trial_end():
    sub = Subscription(
        id=uuid4(),
        tenant_id=uuid4(),
        user_id=uuid4(),
        plan_id=uuid4(),
        status="trialing",
        provider="stripe",
        stripe_subscription_id="sub_tr",
    )
    payload = {
        "id": "sub_tr",
        "status": "trialing",
        "current_period_start": 1700000000,
        "current_period_end": 1700086400,
        "trial_end": 1700500000,
        "canceled_at": None,
    }
    apply_stripe_subscription_payload_to_local(sub, payload)
    assert sub.trial_end == datetime.fromtimestamp(1700500000, tz=timezone.utc)


def test_apply_payload_items_only_periods_newer_stripe_api_shape():
    """Stripe API 2025+ often omits top-level current_period_*; they live on each item."""
    sub = Subscription(
        id=uuid4(),
        tenant_id=uuid4(),
        user_id=uuid4(),
        plan_id=uuid4(),
        status="active",
        provider="stripe",
        stripe_subscription_id="sub_items",
    )
    payload = {
        "id": "sub_items",
        "status": "active",
        "items": {
            "object": "list",
            "data": [
                {
                    "id": "si_x",
                    "current_period_start": 1700000000,
                    "current_period_end": 1702678400,
                }
            ],
        },
        "trial_end": None,
        "canceled_at": None,
    }
    apply_stripe_subscription_payload_to_local(sub, payload)
    assert sub.current_period_start == datetime.fromtimestamp(1700000000, tz=timezone.utc)
    assert sub.current_period_end == datetime.fromtimestamp(1702678400, tz=timezone.utc)
