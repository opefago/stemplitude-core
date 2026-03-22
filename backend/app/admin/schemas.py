"""Admin schemas for global assets and tenant management."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class GlobalAssetCreate(BaseModel):
    """Schema for creating a global asset (via upload)."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "asset_type": "sprite",
                    "name": "Robot Chassis",
                    "lab_type": "game_maker",
                    "category": "robots",
                }
            ]
        }
    )

    asset_type: str = Field(
        ...,
        max_length=50,
        description="Type of asset: 'sprite', 'sound', 'background', etc.",
    )
    name: str = Field(
        ...,
        max_length=200,
        description="Display name for the asset.",
    )
    lab_type: str | None = Field(
        None,
        max_length=50,
        description="Lab type this asset belongs to (e.g., 'game_maker', '3d_designer').",
    )
    category: str | None = Field(
        None,
        max_length=50,
        description="Category for organizing assets (e.g., 'robots', 'vehicles').",
    )
    metadata_: dict | None = Field(
        None,
        alias="metadata",
        description="Additional metadata as key-value pairs.",
    )


class GlobalAssetUpdate(BaseModel):
    """Schema for updating a global asset."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Robot Chassis v2",
                    "lab_type": "game_maker",
                    "category": "robots",
                    "is_active": True,
                }
            ]
        }
    )

    name: str | None = Field(
        None,
        max_length=200,
        description="Display name for the asset.",
    )
    lab_type: str | None = Field(
        None,
        max_length=50,
        description="Lab type this asset belongs to (e.g., 'game_maker', '3d_designer').",
    )
    category: str | None = Field(
        None,
        max_length=50,
        description="Category for organizing assets (e.g., 'robots', 'vehicles').",
    )
    is_active: bool | None = Field(
        None,
        description="Whether the asset is active and visible to users.",
    )
    metadata_: dict | None = Field(
        None,
        alias="metadata",
        description="Additional metadata as key-value pairs.",
    )


class GlobalAssetResponse(BaseModel):
    """Global asset response schema."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID = Field(..., description="Unique identifier for the asset.")
    uploaded_by_user_id: UUID | None = Field(
        None,
        description="ID of the user who uploaded the asset (mutually exclusive with uploaded_by_org_id).",
    )
    uploaded_by_org_id: UUID | None = Field(
        None,
        description="ID of the organization/tenant that uploaded the asset (mutually exclusive with uploaded_by_user_id).",
    )
    asset_type: str = Field(
        ...,
        description="Type of asset: 'sprite', 'sound', 'background', etc.",
    )
    name: str = Field(..., description="Display name for the asset.")
    blob_key: str = Field(..., description="Storage key for the asset file.")
    blob_url: str | None = Field(
        None,
        description="Public URL to access the asset file.",
    )
    mime_type: str | None = Field(
        None,
        description="MIME type of the asset file.",
    )
    file_size: int | None = Field(
        None,
        description="Size of the asset file in bytes.",
    )
    metadata_: dict | None = Field(
        None,
        alias="metadata",
        description="Additional metadata as key-value pairs.",
    )
    lab_type: str | None = Field(
        None,
        description="Lab type this asset belongs to (e.g., 'game_maker', '3d_designer').",
    )
    category: str | None = Field(
        None,
        description="Category for organizing assets (e.g., 'robots', 'vehicles').",
    )
    thumbnail_url: str | None = Field(
        None,
        description="URL to a generated thumbnail preview of the asset.",
    )
    is_active: bool = Field(
        ...,
        description="Whether the asset is active and visible to users.",
    )
    created_at: datetime = Field(
        ...,
        description="Timestamp when the asset was created.",
    )


class GlobalAssetListResponse(BaseModel):
    """Paginated global asset list response."""

    items: list[GlobalAssetResponse] = Field(
        ...,
        description="List of global assets.",
    )
    total: int = Field(
        ...,
        description="Total number of assets matching the query.",
    )


class TenantSummary(BaseModel):
    """Tenant summary for admin stats."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the tenant.")
    name: str = Field(..., description="Display name of the tenant.")
    slug: str = Field(
        ...,
        description="URL-friendly identifier for the tenant.",
    )
    is_active: bool = Field(
        ...,
        description="Whether the tenant is active.",
    )


class TenantListResponse(BaseModel):
    """Paginated tenant list response."""

    items: list[TenantSummary] = Field(..., description="List of tenants.")
    total: int = Field(..., description="Total number of tenants matching the query.")


class AdminStats(BaseModel):
    """Top-level admin dashboard overview."""

    tenant_count: int = Field(..., description="Total number of tenants.")
    active_tenant_count: int = Field(..., description="Number of active tenants.")
    user_count: int = Field(..., description="Total number of users (across all tenants).")
    student_count: int = Field(..., description="Total number of students.")
    active_subscription_count: int = Field(..., description="Number of subscriptions with status 'active' or 'trialing'.")


class TimeSeriesPoint(BaseModel):
    """A single data point in a time series."""

    period: str = Field(..., description="Period label (e.g., '2026-03', '2026-W11').")
    count: int = Field(..., description="Count for this period.")


class GrowthMetrics(BaseModel):
    """Tenant and user growth over time."""

    tenants_created: list[TimeSeriesPoint] = Field(..., description="New tenants created per period.")
    users_created: list[TimeSeriesPoint] = Field(..., description="New users created per period.")
    students_enrolled: list[TimeSeriesPoint] = Field(..., description="New student enrollments per period.")


class InactiveTenant(BaseModel):
    """A tenant that has been inactive for a given duration."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Tenant ID.")
    name: str = Field(..., description="Tenant name.")
    slug: str = Field(..., description="Tenant slug.")
    created_at: datetime = Field(..., description="When the tenant was created.")
    last_activity_at: datetime | None = Field(None, description="Most recent student enrollment or subscription change.")
    inactive_days: int = Field(..., description="Number of days since last activity.")


class InactiveTenantsResponse(BaseModel):
    """Paginated list of inactive tenants."""

    items: list[InactiveTenant] = Field(..., description="List of inactive tenants.")
    total: int = Field(..., description="Total count matching the query.")


class ZeroEnrollmentTenant(BaseModel):
    """A tenant that registered but has no student enrollments."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Tenant ID.")
    name: str = Field(..., description="Tenant name.")
    slug: str = Field(..., description="Tenant slug.")
    created_at: datetime = Field(..., description="When the tenant registered.")
    user_count: int = Field(..., description="Number of staff users in this tenant.")


class ZeroEnrollmentResponse(BaseModel):
    """Paginated list of tenants with zero enrollments."""

    items: list[ZeroEnrollmentTenant] = Field(..., description="Tenants with no student enrollments.")
    total: int = Field(..., description="Total count matching the query.")


class ChurnedTenant(BaseModel):
    """A tenant whose subscription ended and was not renewed."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Tenant ID.")
    name: str = Field(..., description="Tenant name.")
    slug: str = Field(..., description="Tenant slug.")
    subscription_status: str = Field(..., description="Last subscription status (e.g., 'canceled', 'expired').")
    ended_at: datetime | None = Field(None, description="When the subscription period ended.")
    was_trial: bool = Field(..., description="Whether the churned subscription was still in trial.")
    student_count: int = Field(..., description="Number of enrolled students at time of churn.")


class ChurnedTenantsResponse(BaseModel):
    """Paginated list of churned tenants."""

    items: list[ChurnedTenant] = Field(..., description="Tenants that did not renew after subscription or trial ended.")
    total: int = Field(..., description="Total count matching the query.")


class SubscriptionBreakdown(BaseModel):
    """Subscription counts grouped by status."""

    status: str = Field(..., description="Subscription status (e.g., 'active', 'trialing', 'canceled').")
    count: int = Field(..., description="Number of subscriptions with this status.")


class MetricCounts(BaseModel):
    """Lightweight counts for dashboard summary cards."""

    inactive_tenant_count: int = Field(..., description="Tenants with no recent activity.")
    zero_enrollment_count: int = Field(..., description="Tenants with zero student enrollments.")
    churned_tenant_count: int = Field(..., description="Tenants whose subscription ended and was not renewed.")
