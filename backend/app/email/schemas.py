"""Email schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EmailProviderResponse(BaseModel):
    """Email provider response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the email provider.")
    provider: str = Field(
        ...,
        description="Provider name: 'smtp', 'sendgrid', 'ses', etc.",
    )
    is_active: bool = Field(
        ...,
        description="Whether this provider is active for sending emails.",
    )
    priority: int = Field(
        ...,
        description="Priority for sending (lower = higher priority).",
    )
    config: dict | None = Field(
        None,
        description="Provider-specific configuration (credentials, endpoints).",
    )
    created_at: datetime = Field(
        ...,
        description="Timestamp when the provider was configured.",
    )


class EmailProviderUpdate(BaseModel):
    """Schema for updating email provider."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "is_active": True,
                    "priority": 1,
                }
            ]
        }
    )

    is_active: bool | None = Field(
        None,
        description="Whether this provider is active for sending emails.",
    )
    priority: int | None = Field(
        None,
        description="Priority for sending (lower = higher priority).",
    )
    config: dict | None = Field(
        None,
        description="Provider-specific configuration (credentials, endpoints).",
    )


class EmailLogResponse(BaseModel):
    """Email log response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the email log entry.")
    provider: str = Field(
        ...,
        description="Provider used to send the email.",
    )
    recipient: str = Field(
        ...,
        description="Email address of the recipient.",
    )
    subject: str = Field(..., description="Subject line of the email.")
    status: str = Field(
        ...,
        description="Delivery status: 'sent', 'failed', 'queued', etc.",
    )
    message_id: str | None = Field(
        None,
        description="Message ID from the provider (for tracking).",
    )
    error: str | None = Field(
        None,
        description="Error message if delivery failed.",
    )
    created_at: datetime = Field(
        ...,
        description="Timestamp when the email was sent.",
    )


class EmailLogListResponse(BaseModel):
    """Paginated email log list response."""

    items: list[EmailLogResponse] = Field(
        ...,
        description="List of email log entries.",
    )
    total: int = Field(
        ...,
        description="Total number of log entries matching the query.",
    )
