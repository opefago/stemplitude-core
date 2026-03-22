"""Integrations schemas for OAuth and calendar connections."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OAuthConnectionResponse(BaseModel):
    """OAuth connection response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the OAuth connection.")
    user_id: UUID = Field(..., description="ID of the user who owns the connection.")
    tenant_id: UUID | None = Field(
        None,
        description="ID of the tenant (null for personal connections).",
    )
    provider: str = Field(
        ...,
        description="OAuth provider: 'google', 'microsoft', etc.",
    )
    provider_account_id: str | None = Field(
        None,
        description="Account ID from the provider.",
    )
    scopes: str | None = Field(
        None,
        description="Comma-separated list of granted OAuth scopes.",
    )
    calendar_sync_enabled: bool = Field(
        ...,
        description="Whether calendar sync is enabled for this connection.",
    )
    calendar_id: str | None = Field(
        None,
        description="ID of the calendar to sync (e.g., 'primary').",
    )
    is_active: bool = Field(
        ...,
        description="Whether the connection is active.",
    )
    created_at: datetime = Field(
        ...,
        description="Timestamp when the connection was created.",
    )


class OAuthConnectionUpdate(BaseModel):
    """Schema for updating OAuth connection (calendar settings)."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "calendar_sync_enabled": True,
                    "calendar_id": "primary",
                }
            ]
        }
    )

    calendar_sync_enabled: bool | None = Field(
        None,
        description="Whether calendar sync is enabled for this connection.",
    )
    calendar_id: str | None = Field(
        None,
        max_length=200,
        description="ID of the calendar to sync (e.g., 'primary').",
    )


class CalendarSummary(BaseModel):
    """Calendar summary from provider."""

    id: str = Field(..., description="Calendar ID from the provider.")
    name: str = Field(..., description="Display name of the calendar.")
    primary: bool = Field(
        False,
        description="Whether this is the user's primary calendar.",
    )


class ConnectRedirect(BaseModel):
    """Redirect URL for OAuth connect."""

    url: str = Field(
        ...,
        description="URL to redirect the user to for OAuth authorization.",
    )
