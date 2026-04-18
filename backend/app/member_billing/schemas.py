from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ConnectStatusResponse(BaseModel):
    stripe_connect_account_id: str | None
    charges_enabled: bool
    payouts_enabled: bool
    details_submitted: bool
    member_billing_enabled: bool
    require_member_billing_for_access: bool
    member_billing_tax_enabled: bool
    member_billing_tax_behavior_default: str
    connect_configured: bool


class MemberBillingIntegrationsSummary(BaseModel):
    """Read-only card for Integrations page (no secrets)."""

    platform_stripe_configured: bool
    connect_account_linked: bool
    charges_enabled: bool
    member_billing_enabled: bool
    details_submitted: bool


class GuardianChildMembershipOut(BaseModel):
    """Per-learner entitlement for guardian-facing nav (Stripe subs + paid one-time)."""

    student_id: uuid.UUID
    has_active_membership: bool


class GuardianMemberStatusOut(BaseModel):
    """Tenant flags plus whether each linked child has an active paid entitlement."""

    member_billing_enabled: bool
    require_member_billing_for_access: bool
    children: list[GuardianChildMembershipOut]


class AdminPaymentLinkRequest(BaseModel):
    """Admin-generated Checkout link for a specific learner (card entry on Stripe only)."""

    student_id: uuid.UUID
    product_id: uuid.UUID
    payer_user_id: uuid.UUID | None = None


class MemberBillingSettingsUpdate(BaseModel):
    member_billing_enabled: bool | None = None
    require_member_billing_for_access: bool | None = None
    member_billing_tax_enabled: bool | None = None
    member_billing_tax_behavior_default: Literal["exclusive", "inclusive"] | None = None


class MemberProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    amount_cents: int = Field(ge=50, le=99_999_999)
    currency: str = Field(default="usd", min_length=3, max_length=3)
    billing_type: Literal["one_time", "recurring"]
    interval: Literal["month", "quarter", "year"] | None = None
    tax_behavior: Literal["exclusive", "inclusive", "none"] | None = None

    @field_validator("currency", mode="before")
    @classmethod
    def normalize_currency(cls, v: object) -> str:
        if v is None or (isinstance(v, str) and not v.strip()):
            return "usd"
        s = str(v).strip().lower()
        if len(s) != 3 or not s.isalpha():
            raise ValueError("Currency must be a 3-letter ISO code (e.g. usd, eur, jpy).")
        return s


class MemberProductUpdate(BaseModel):
    """Partial update. To change price (Stripe creates a new Price), send amount_cents, currency, and billing_type together."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    active: bool | None = None
    amount_cents: int | None = Field(default=None, ge=50, le=99_999_999)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    billing_type: Literal["one_time", "recurring"] | None = None
    interval: Literal["month", "quarter", "year"] | None = None
    tax_behavior: Literal["exclusive", "inclusive", "none"] | None = None

    @field_validator("currency", mode="before")
    @classmethod
    def normalize_currency_optional(cls, v: object) -> str | None:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        s = str(v).strip().lower()
        if len(s) != 3 or not s.isalpha():
            raise ValueError("Currency must be a 3-letter ISO code (e.g. usd, eur, jpy).")
        return s

    @model_validator(mode="after")
    def pricing_fields_together(self) -> MemberProductUpdate:
        fs = self.model_fields_set
        pricing = {"amount_cents", "currency", "billing_type"}
        if not fs.intersection(pricing):
            return self
        if not pricing <= fs:
            raise ValueError("When updating pricing, send amount_cents, currency, and billing_type together.")
        if self.billing_type == "recurring":
            if self.interval is None:
                raise ValueError("interval is required when billing_type is recurring")
        elif self.interval is not None:
            raise ValueError("interval must be omitted for one_time pricing")
        return self


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
    tax_behavior: str | None
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
    stripe_subscription_id: str | None = None
    current_period_start: datetime | None
    current_period_end: datetime | None
    canceled_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberSubscriptionCancelRequest(BaseModel):
    """Cancel on the connected Stripe account. Default: end after the current billing period."""

    immediate: bool = False


class MemberInvoiceOut(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    member_subscription_id: uuid.UUID | None
    member_purchase_id: uuid.UUID | None = None
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
