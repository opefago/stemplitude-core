"""License schemas."""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LicenseFeatureBase(BaseModel):
    """Base license feature schema."""

    feature_key: str = Field(
        ...,
        max_length=100,
        description="Unique identifier for the feature (e.g. robotics_lab, design_maker).",
    )
    enabled: bool = Field(
        True,
        description="Whether this feature is enabled for the license.",
    )


class LicenseFeatureCreate(LicenseFeatureBase):
    """Schema for creating a license feature."""

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


class LicenseFeatureResponse(LicenseFeatureBase):
    """License feature response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier of the license feature.")
    license_id: UUID = Field(
        ...,
        description="ID of the license this feature belongs to.",
    )


class LicenseLimitBase(BaseModel):
    """Base license limit schema."""

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


class LicenseLimitCreate(LicenseLimitBase):
    """Schema for creating a license limit."""

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


class LicenseLimitResponse(LicenseLimitBase):
    """License limit response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier of the license limit.")
    license_id: UUID = Field(
        ...,
        description="ID of the license this limit belongs to.",
    )


class SeatCreate(BaseModel):
    """Schema for a seat allocation."""

    seat_type: str = Field(
        ...,
        max_length=50,
        description="Type of seat (e.g. student, teacher, admin).",
    )
    max_count: int = Field(
        ...,
        ge=0,
        description="Maximum number of seats of this type.",
    )


class SeatUsageResponse(BaseModel):
    """Seat usage response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier of the seat usage record.")
    license_id: UUID = Field(
        ...,
        description="ID of the license this seat usage belongs to.",
    )
    tenant_id: UUID = Field(
        ...,
        description="ID of the tenant (organization).",
    )
    seat_type: str = Field(
        ...,
        description="Type of seat (e.g. student, teacher).",
    )
    current_count: int = Field(
        ...,
        description="Current number of seats in use.",
    )
    max_count: int = Field(
        ...,
        description="Maximum number of seats allowed.",
    )
    updated_at: datetime = Field(
        ...,
        description="When the seat usage was last updated.",
    )


class LicenseBase(BaseModel):
    """Base license schema."""

    subscription_id: UUID | None = Field(
        None,
        description="ID of the subscription that grants this license, if any.",
    )
    tenant_id: UUID = Field(
        ...,
        description="ID of the tenant (organization) this license belongs to.",
    )
    user_id: UUID | None = Field(
        None,
        description="ID of the user who owns or manages this license, if any.",
    )
    status: str = Field(
        default="active",
        max_length=20,
        description="License status (e.g. active, expired, suspended).",
    )
    valid_from: date = Field(
        ...,
        description="Date when the license becomes valid.",
    )
    valid_until: date | None = Field(
        None,
        description="Date when the license expires.",
    )


class LicenseCreate(LicenseBase):
    """Schema for creating a license."""

    features: list[LicenseFeatureCreate] = Field(
        default_factory=list,
        description="List of features enabled for this license.",
    )
    limits: list[LicenseLimitCreate] = Field(
        default_factory=list,
        description="List of usage limits for this license.",
    )
    seats: list[SeatCreate] = Field(
        default_factory=list,
        description="Seat allocations by type (e.g. student, teacher).",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
                    "valid_from": "2026-03-14",
                    "status": "active",
                    "features": [
                        {"feature_key": "robotics_lab", "enabled": True},
                    ],
                    "limits": [
                        {"limit_key": "max_students", "limit_value": 50},
                    ],
                    "seats": [
                        {"seat_type": "student", "max_count": 50},
                    ],
                },
            ]
        }
    )


class LicenseUpdate(BaseModel):
    """Schema for updating a license."""

    subscription_id: UUID | None = Field(
        None,
        description="ID of the subscription that grants this license, if any.",
    )
    user_id: UUID | None = Field(
        None,
        description="ID of the user who owns or manages this license, if any.",
    )
    status: str | None = Field(
        None,
        max_length=20,
        description="License status (e.g. active, expired, suspended).",
    )
    valid_from: date | None = Field(
        None,
        description="Date when the license becomes valid.",
    )
    valid_until: date | None = Field(
        None,
        description="Date when the license expires.",
    )
    features: list[LicenseFeatureCreate] | None = Field(
        None,
        description="List of features enabled for this license.",
    )
    limits: list[LicenseLimitCreate] | None = Field(
        None,
        description="List of usage limits for this license.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "status": "suspended",
                    "valid_until": "2026-12-31",
                },
            ]
        }
    )


class LicenseResponse(LicenseBase):
    """License response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier of the license.")
    created_at: datetime = Field(
        ...,
        description="When the license was created.",
    )
    features: list[LicenseFeatureResponse] = Field(
        default_factory=list,
        description="List of features enabled for this license.",
    )
    limits: list[LicenseLimitResponse] = Field(
        default_factory=list,
        description="List of usage limits for this license.",
    )


class EntitlementsResponse(BaseModel):
    """Entitlements (features + limits) for current license."""

    features: list[LicenseFeatureResponse] = Field(
        default_factory=list,
        description="Features enabled for the current license.",
    )
    limits: list[LicenseLimitResponse] = Field(
        default_factory=list,
        description="Usage limits for the current license.",
    )
