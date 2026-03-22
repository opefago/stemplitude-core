"""Subscription schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CheckoutRequest(BaseModel):
    """Request to create a checkout session."""

    plan_id: UUID = Field(
        ...,
        description="ID of the plan to subscribe to.",
    )
    success_url: str = Field(
        ...,
        max_length=500,
        description="URL to redirect the user after successful checkout.",
    )
    cancel_url: str = Field(
        ...,
        max_length=500,
        description="URL to redirect the user if checkout is cancelled.",
    )
    billing_cycle: str = Field(
        default="monthly",
        pattern="^(monthly|yearly)$",
        description="Billing cycle: 'monthly' or 'yearly'.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "plan_id": "550e8400-e29b-41d4-a716-446655440000",
                    "success_url": "https://app.stemplitude.com/billing/success",
                    "cancel_url": "https://app.stemplitude.com/billing/cancel",
                    "billing_cycle": "monthly",
                },
            ]
        }
    )


class CheckoutResponse(BaseModel):
    """Checkout session response."""

    session_id: str = Field(
        ...,
        description="Stripe Checkout Session ID.",
    )
    url: str | None = Field(
        None,
        description="URL to redirect the user to complete payment.",
    )


class InvoiceResponse(BaseModel):
    """Invoice response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier of the invoice.")
    subscription_id: UUID = Field(
        ...,
        description="ID of the subscription this invoice belongs to.",
    )
    stripe_invoice_id: str | None = Field(
        None,
        description="Stripe Invoice ID.",
    )
    amount_cents: int = Field(
        ...,
        description="Invoice amount in cents.",
    )
    currency: str = Field(
        ...,
        description="Three-letter ISO currency code (e.g. USD).",
    )
    status: str = Field(
        ...,
        description="Invoice status (e.g. paid, open, draft).",
    )
    period_start: datetime | None = Field(
        None,
        description="Start of the billing period covered by this invoice.",
    )
    period_end: datetime | None = Field(
        None,
        description="End of the billing period covered by this invoice.",
    )
    paid_at: datetime | None = Field(
        None,
        description="When the invoice was paid.",
    )
    created_at: datetime = Field(
        ...,
        description="When the invoice record was created.",
    )


class SubscriptionResponse(BaseModel):
    """Subscription response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier of the subscription.")
    tenant_id: UUID = Field(
        ...,
        description="ID of the tenant (organization) this subscription belongs to.",
    )
    user_id: UUID = Field(
        ...,
        description="ID of the user who owns or manages this subscription.",
    )
    plan_id: UUID = Field(
        ...,
        description="ID of the subscribed plan.",
    )
    status: str = Field(
        ...,
        description="Subscription status (e.g. active, canceled, past_due).",
    )
    stripe_subscription_id: str | None = Field(
        None,
        description="Stripe Subscription ID.",
    )
    stripe_customer_id: str | None = Field(
        None,
        description="Stripe Customer ID.",
    )
    current_period_start: datetime | None = Field(
        None,
        description="Start of the current billing period.",
    )
    current_period_end: datetime | None = Field(
        None,
        description="End of the current billing period.",
    )
    trial_end: datetime | None = Field(
        None,
        description="When the trial period ends.",
    )
    canceled_at: datetime | None = Field(
        None,
        description="When the subscription was canceled.",
    )
    promo_code: str | None = Field(
        None,
        description="Applied promotional code.",
    )
    created_at: datetime = Field(
        ...,
        description="When the subscription was created.",
    )
    updated_at: datetime = Field(
        ...,
        description="When the subscription was last updated.",
    )


class SubscriptionListResponse(BaseModel):
    """List of subscriptions."""

    items: list[SubscriptionResponse] = Field(
        ...,
        description="List of subscriptions for the current page.",
    )
    total: int = Field(
        ...,
        description="Total number of subscriptions matching the query.",
    )
