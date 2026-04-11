"""Plan schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PlanFeatureBase(BaseModel):
    """Base plan feature schema."""

    feature_key: str = Field(
        ...,
        max_length=100,
        description="Unique identifier for the feature (e.g. robotics_lab, design_maker).",
    )
    enabled: bool = Field(
        True,
        description="Whether this feature is enabled for the plan.",
    )


class PlanFeatureCreate(PlanFeatureBase):
    """Schema for creating a plan feature."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "feature_key": "robotics_lab",
                    "enabled": True,
                },
            ]
        }
    )


class PlanFeatureResponse(PlanFeatureBase):
    """Plan feature response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier of the plan feature.")
    plan_id: UUID = Field(..., description="ID of the plan this feature belongs to.")


class PlanLimitBase(BaseModel):
    """Base plan limit schema."""

    limit_key: str = Field(
        ...,
        max_length=100,
        description="Unique identifier for the limit (e.g. max_students, max_projects).",
    )
    limit_value: int = Field(
        ...,
        ge=0,
        description="Numeric value of the limit.",
    )


class PlanLimitCreate(PlanLimitBase):
    """Schema for creating a plan limit."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "limit_key": "max_students",
                    "limit_value": 50,
                },
            ]
        }
    )


class PlanLimitResponse(PlanLimitBase):
    """Plan limit response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier of the plan limit.")
    plan_id: UUID = Field(..., description="ID of the plan this limit belongs to.")


class PlanBase(BaseModel):
    """Base plan schema."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Display name of the plan.",
    )
    slug: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="URL-safe unique identifier for the plan.",
    )
    type: str = Field(
        ...,
        max_length=50,
        description="Plan type (e.g. center, school, individual).",
    )
    price_monthly: float | None = Field(
        None,
        ge=0,
        description="Monthly price in the plan's currency.",
    )
    price_yearly: float | None = Field(
        None,
        ge=0,
        description="Yearly price in the plan's currency.",
    )
    stripe_price_id_monthly: str | None = Field(
        None,
        max_length=100,
        description="Stripe Price ID for monthly billing.",
    )
    stripe_price_id_yearly: str | None = Field(
        None,
        max_length=100,
        description="Stripe Price ID for yearly billing.",
    )
    trial_days: int = Field(
        0,
        ge=0,
        description="Number of days for the free trial period.",
    )
    is_active: bool = Field(
        True,
        description="Whether the plan is available for purchase.",
    )


class PlanCreate(PlanBase):
    """Schema for creating a plan."""

    features: list[PlanFeatureCreate] = Field(
        default_factory=list,
        description="List of features included in this plan.",
    )
    limits: list[PlanLimitCreate] = Field(
        default_factory=list,
        description="List of usage limits for this plan.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Pro (Center)",
                    "slug": "pro-center",
                    "type": "center",
                    "price_monthly": 149.99,
                    "price_yearly": 1499.99,
                    "trial_days": 14,
                    "features": [
                        {"feature_key": "robotics_lab", "enabled": True},
                    ],
                    "limits": [
                        {"limit_key": "max_students", "limit_value": 50},
                    ],
                },
            ]
        }
    )


class PlanUpdate(BaseModel):
    """Schema for updating a plan."""

    name: str | None = Field(
        None,
        min_length=1,
        max_length=100,
        description="Display name of the plan.",
    )
    slug: str | None = Field(
        None,
        min_length=1,
        max_length=100,
        description="URL-safe unique identifier for the plan.",
    )
    type: str | None = Field(
        None,
        max_length=50,
        description="Plan type (e.g. center, school, individual).",
    )
    price_monthly: float | None = Field(
        None,
        ge=0,
        description="Monthly price in the plan's currency.",
    )
    price_yearly: float | None = Field(
        None,
        ge=0,
        description="Yearly price in the plan's currency.",
    )
    stripe_price_id_monthly: str | None = Field(
        None,
        max_length=100,
        description="Stripe Price ID for monthly billing.",
    )
    stripe_price_id_yearly: str | None = Field(
        None,
        max_length=100,
        description="Stripe Price ID for yearly billing.",
    )
    trial_days: int | None = Field(
        None,
        ge=0,
        description="Number of days for the free trial period.",
    )
    is_active: bool | None = Field(
        None,
        description="Whether the plan is available for purchase.",
    )
    features: list[PlanFeatureCreate] | None = Field(
        None,
        description="List of features included in this plan.",
    )
    limits: list[PlanLimitCreate] | None = Field(
        None,
        description="List of usage limits for this plan.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Pro (Center) - Updated",
                    "price_monthly": 159.99,
                    "trial_days": 7,
                },
            ]
        }
    )


class PlanResponse(PlanBase):
    """Plan response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier of the plan.")
    created_at: datetime = Field(..., description="When the plan was created.")
    stripe_checkout_monthly_ready: bool = Field(
        False,
        description="True if Stripe checkout can start for monthly billing (plan price or dev fallback).",
    )
    stripe_checkout_yearly_ready: bool = Field(
        False,
        description="True if Stripe checkout can start for yearly billing (plan price or dev fallback).",
    )
    features: list[PlanFeatureResponse] = Field(
        default_factory=list,
        description="List of features included in this plan.",
    )
    limits: list[PlanLimitResponse] = Field(
        default_factory=list,
        description="List of usage limits for this plan.",
    )


class PlanListResponse(BaseModel):
    """Paginated plan list response."""

    items: list[PlanResponse] = Field(
        ...,
        description="List of plans for the current page.",
    )
    total: int = Field(
        ...,
        description="Total number of plans matching the query.",
    )
