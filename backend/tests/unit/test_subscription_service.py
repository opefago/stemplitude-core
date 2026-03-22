"""Unit tests for SubscriptionService — repos and Stripe are mocked."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.dependencies import CurrentIdentity, TenantContext
from app.subscriptions.schemas import CheckoutRequest
from app.subscriptions.service import SubscriptionService


pytestmark = pytest.mark.unit


@pytest.fixture
def mock_repos():
    return {
        "repo": AsyncMock(),
        "plan_repo": AsyncMock(),
        "user_repo": AsyncMock(),
    }


@pytest.fixture
def service(mock_db, mock_repos):
    svc = SubscriptionService.__new__(SubscriptionService)
    svc.session = mock_db
    svc.repo = mock_repos["repo"]
    svc.plan_repo = mock_repos["plan_repo"]
    svc.user_repo = mock_repos["user_repo"]
    return svc


@pytest.fixture
def identity():
    return CurrentIdentity(
        id=uuid4(),
        sub_type="user",
        is_super_admin=False,
        tenant_id=uuid4(),
    )


@pytest.fixture
def tenant_ctx(identity):
    return TenantContext(
        tenant_id=identity.tenant_id,
        tenant_slug="test-center",
    )


class TestCreateCheckout:
    async def test_plan_not_found_returns_none(self, service, mock_repos, identity, tenant_ctx):
        mock_repos["plan_repo"].get_by_id.return_value = None

        result = await service.create_checkout(
            identity,
            tenant_ctx,
            CheckoutRequest(
                plan_id=uuid4(),
                success_url="https://ok",
                cancel_url="https://cancel",
            ),
        )

        assert result is None

    async def test_no_price_id_returns_none(self, service, mock_repos, identity, tenant_ctx):
        plan = MagicMock()
        plan.stripe_price_id_monthly = None
        plan.stripe_price_id_yearly = None
        mock_repos["plan_repo"].get_by_id.return_value = plan

        result = await service.create_checkout(
            identity,
            tenant_ctx,
            CheckoutRequest(
                plan_id=uuid4(),
                success_url="https://ok",
                cancel_url="https://cancel",
            ),
        )

        assert result is None

    @patch("app.subscriptions.service.create_checkout_session")
    async def test_success(self, mock_stripe, service, mock_repos, identity, tenant_ctx):
        plan = MagicMock()
        plan.stripe_price_id_monthly = "price_123"
        plan.trial_days = 14
        mock_repos["plan_repo"].get_by_id.return_value = plan

        user = MagicMock()
        user.email = "user@test.com"
        mock_repos["user_repo"].get_by_id.return_value = user

        stripe_session = MagicMock()
        stripe_session.id = "cs_123"
        stripe_session.url = "https://checkout.stripe.com/123"
        mock_stripe.return_value = stripe_session

        result = await service.create_checkout(
            identity,
            tenant_ctx,
            CheckoutRequest(
                plan_id=uuid4(),
                success_url="https://ok",
                cancel_url="https://cancel",
            ),
        )

        assert result is not None
        assert result.session_id == "cs_123"


class TestGetSubscription:
    async def test_not_found_returns_none(self, service, mock_repos, identity, tenant_ctx):
        mock_repos["repo"].get_by_id.return_value = None

        result = await service.get_subscription(uuid4(), identity, tenant_ctx)

        assert result is None

    async def test_wrong_tenant_returns_none(self, service, mock_repos, identity, tenant_ctx):
        sub = MagicMock()
        sub.tenant_id = uuid4()  # different from tenant_ctx
        mock_repos["repo"].get_by_id.return_value = sub

        result = await service.get_subscription(sub.id, identity, tenant_ctx)

        assert result is None


class TestListSubscriptions:
    async def test_returns_list(self, service, mock_repos, identity, tenant_ctx):
        mock_repos["repo"].list_by_tenant.return_value = ([], 0)

        result = await service.list_subscriptions(identity, tenant_ctx)

        assert result is not None
