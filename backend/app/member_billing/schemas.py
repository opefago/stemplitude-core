from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ConnectStatusResponse(BaseModel):
    stripe_connect_account_id: str | None
    charges_enabled: bool
    payouts_enabled: bool
    details_submitted: bool
    member_billing_enabled: bool
    require_member_billing_for_access: bool
    connect_configured: bool


class MemberBillingIntegrationsSummary(BaseModel):
    """Read-only card for Integrations page (no secrets)."""

    platform_stripe_configured: bool
    connect_account_linked: bool
    charges_enabled: bool
    member_billing_enabled: bool
    details_submitted: bool


class AdminPaymentLinkRequest(BaseModel):
    """Admin-generated Checkout link for a specific learner (card entry on Stripe only)."""

    student_id: uuid.UUID
    product_id: uuid.UUID
    payer_user_id: uuid.UUID | None = None


class MemberBillingSettingsUpdate(BaseModel):
    member_billing_enabled: bool | None = None
    require_member_billing_for_access: bool | None = None


class MemberProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    amount_cents: int = Field(ge=50, le=99_999_999)
    currency: str = Field(default="usd", max_length=3)
    billing_type: Literal["one_time", "recurring"]
    interval: Literal["month", "quarter", "year"] | None = None


class MemberProductOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str | None
    amount_cents: int
    currency: str
    billing_type: str
    interval: str | None
    active: bool
    stripe_product_id: str | None
    stripe_price_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberSubscriptionOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    product_id: uuid.UUID
    student_id: uuid.UUID
    payer_user_id: uuid.UUID | None
    status: str
    current_period_start: datetime | None
    current_period_end: datetime | None
    canceled_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberInvoiceOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    member_subscription_id: uuid.UUID | None
    stripe_invoice_id: str | None
    amount_cents: int
    currency: str
    status: str
    hosted_invoice_url: str | None
    invoice_pdf: str | None
    period_start: datetime | None
    period_end: datetime | None
    paid_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberPurchaseOut(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    student_id: uuid.UUID
    amount_cents: int
    currency: str
    paid_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AccountLinkResponse(BaseModel):
    url: str


class CheckoutRequest(BaseModel):
    product_id: uuid.UUID
    student_id: uuid.UUID


class CheckoutResponse(BaseModel):
    url: str


class AnalyticsSummary(BaseModel):
    period_start: str
    period_end: str
    active_subscriptions: int
    new_subscriptions: int
    canceled_subscriptions: int
    churn_rate_percent: float | None
    revenue_cents: int
    paid_invoices_count: int
    mrr_cents_approx: int
