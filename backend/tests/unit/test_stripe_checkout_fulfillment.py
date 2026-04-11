"""Unit tests for Stripe checkout webhook fulfillment helpers."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.subscriptions import stripe_checkout_fulfillment as ful

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    "raw,expected",
    [
        (None, None),
        ("", None),
        ("  sub_123  ", "sub_123"),
        (MagicMock(id="sub_x"), "sub_x"),
        ({"id": "sub_dict"}, "sub_dict"),
    ],
)
def test_coerce_stripe_expandable_id(raw, expected):
    assert ful.coerce_stripe_expandable_id(raw) == expected


def test_merge_client_reference_into_metadata():
    md: dict[str, str] = {}
    ful._merge_client_reference_into_metadata(
        md,
        {"client_reference_id": f"{uuid.uuid4()}|{uuid.uuid4()}|{uuid.uuid4()}"},
    )
    assert ful._metadata_has_tenant_user_plan(md)


@pytest.mark.asyncio
async def test_fulfill_triggers_retrieve_when_only_tenant_in_metadata(monkeypatch):
    """Previously we only re-fetched when tenant_id was missing; partial metadata skipped API hydrate."""
    db = AsyncMock()
    tid, uid, pid = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    session = MagicMock()
    session.id = "cs_partial"
    session.subscription = "sub_1"
    session.customer = "cus_1"
    session.metadata = {"tenant_id": tid}
    session.client_reference_id = None

    calls = {"n": 0}

    def retrieve_sess(sid):
        calls["n"] += 1
        assert sid == "cs_partial"
        full = MagicMock()
        full.id = "cs_partial"
        full.subscription = "sub_1"
        full.customer = "cus_1"
        full.metadata = {"tenant_id": tid, "user_id": uid, "plan_id": pid}
        full.client_reference_id = None
        return full

    mock_sub = MagicMock()
    mock_sub.status = "active"
    mock_sub.current_period_start = None
    mock_sub.current_period_end = None
    mock_sub.trial_end = None

    upsert = AsyncMock()
    monkeypatch.setattr(ful, "upsert_subscription_from_stripe_checkout", upsert)

    ok = await ful.fulfill_checkout_session_webhook(
        db,
        session,
        retrieve_subscription_fn=lambda _sid: mock_sub,
        retrieve_checkout_session_fn=retrieve_sess,
    )
    assert ok is True
    assert calls["n"] == 1
    upsert.assert_awaited_once()


@pytest.mark.asyncio
async def test_fulfill_uses_client_reference_when_metadata_empty(monkeypatch):
    db = AsyncMock()
    tid, uid, pid = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    session = MagicMock()
    session.id = "cs_ref"
    session.subscription = "sub_1"
    session.customer = "cus_1"
    session.metadata = {}
    session.client_reference_id = f"{tid}|{uid}|{pid}"

    mock_sub = MagicMock()
    mock_sub.status = "active"
    mock_sub.current_period_start = None
    mock_sub.current_period_end = None
    mock_sub.trial_end = None

    upsert = AsyncMock()
    monkeypatch.setattr(ful, "upsert_subscription_from_stripe_checkout", upsert)

    ok = await ful.fulfill_checkout_session_webhook(
        db,
        session,
        retrieve_subscription_fn=lambda _sid: mock_sub,
        retrieve_checkout_session_fn=lambda _sid: None,
    )
    assert ok is True
    upsert.assert_awaited_once()


def test_enrich_metadata_from_checkout_sessions(monkeypatch):
    listed = MagicMock()
    listed.data = [
        MagicMock(metadata={"tenant_id": "t1", "user_id": "u1", "plan_id": "p1"}),
    ]
    monkeypatch.setattr(
        "app.subscriptions.stripe_client.list_checkout_sessions_for_subscription",
        lambda sid, limit=5: listed,
    )
    base: dict[str, str] = {}
    out = ful.enrich_metadata_from_checkout_sessions_for_subscription(base, "sub_x")
    assert out["tenant_id"] == "t1"
    assert out["user_id"] == "u1"
    assert out["plan_id"] == "p1"


def test_session_metadata_from_dict_session():
    md = ful._session_metadata(
        {
            "id": "cs_x",
            "metadata": {"tenant_id": "t1", "user_id": "u1", "plan_id": "p1"},
        }
    )
    assert md.get("tenant_id") == "t1"
    assert ful._session_attr({"id": "cs_x"}, "id") == "cs_x"


def test_checkout_session_view_from_dict():
    v = ful.checkout_session_view_from_dict(
        {
            "id": "cs_1",
            "metadata": {"tenant_id": "t", "plan_id": "p", "user_id": "u"},
            "subscription": {"id": "sub_1"},
            "customer": "cus_1",
        }
    )
    assert v.id == "cs_1"
    assert v.metadata["plan_id"] == "p"
    assert v.subscription == {"id": "sub_1"}
    assert v.customer == "cus_1"


@pytest.mark.asyncio
async def test_fulfill_retrieves_session_when_subscription_missing(monkeypatch):
    db = AsyncMock()
    session = MagicMock()
    session.id = "cs_test"
    session.subscription = None
    session.customer = "cus_1"
    session.metadata = {
        "tenant_id": str(uuid.uuid4()),
        "user_id": str(uuid.uuid4()),
        "plan_id": str(uuid.uuid4()),
    }

    full = MagicMock()
    full.id = "cs_test"
    full.subscription = "sub_from_api"
    full.customer = "cus_1"
    full.metadata = session.metadata

    def retrieve_sess(sid):
        assert sid == "cs_test"
        return full

    mock_sub = MagicMock()
    mock_sub.status = "active"
    mock_sub.current_period_start = None
    mock_sub.current_period_end = None
    mock_sub.trial_end = None

    def retrieve_sub(sid):
        assert sid == "sub_from_api"
        return mock_sub

    upsert = AsyncMock()
    monkeypatch.setattr(ful, "upsert_subscription_from_stripe_checkout", upsert)

    ok = await ful.fulfill_checkout_session_webhook(
        db,
        session,
        retrieve_subscription_fn=retrieve_sub,
        retrieve_checkout_session_fn=retrieve_sess,
    )
    assert ok is True
    upsert.assert_awaited_once()


@pytest.mark.asyncio
async def test_ensure_subscription_returns_none_without_metadata(monkeypatch):
    class FakeRepo:
        def __init__(self, session):
            pass

        async def get_by_stripe_id(self, _sid):
            return None

    monkeypatch.setattr(ful, "SubscriptionRepository", FakeRepo)

    db = MagicMock()

    def retrieve_sub(_sid):
        m = MagicMock()
        m.metadata = {}
        m.customer = None
        return m

    out = await ful.ensure_subscription_from_stripe_subscription_id(
        db, "sub_x", retrieve_subscription_fn=retrieve_sub
    )
    assert out is None
