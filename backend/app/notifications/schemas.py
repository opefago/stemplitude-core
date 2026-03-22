"""Notifications schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class NotificationResponse(BaseModel):
    """Notification response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Unique identifier for the notification.")
    user_id: UUID | None = Field(
        None,
        description="Recipient user (parent/instructor/admin) when not a student inbox row.",
    )
    student_id: UUID | None = Field(
        None,
        description="Recipient student when the notification targets a student login.",
    )
    tenant_id: UUID | None = Field(
        None,
        description="ID of the tenant (null for system-wide notifications).",
    )
    type: str = Field(
        ...,
        description="Notification type: 'system', 'message', 'assignment', etc.",
    )
    title: str = Field(..., description="Short title of the notification.")
    body: str | None = Field(
        None,
        description="Detailed body content of the notification.",
    )
    action_path: str | None = Field(
        None,
        description="Optional in-app path to open when notification is clicked.",
    )
    action_label: str | None = Field(
        None,
        description="Optional call-to-action label.",
    )
    is_read: bool = Field(
        ...,
        description="Whether the notification has been read by the user.",
    )
    created_at: datetime = Field(
        ...,
        description="Timestamp when the notification was created.",
    )


class NotificationUnreadCountResponse(BaseModel):
    """Lightweight poll / badge count (avoids loading full lists)."""

    unread_count: int = Field(..., ge=0, description="Notifications with is_read=false.")


class NotificationListResponse(BaseModel):
    """Paginated notification list response."""

    items: list[NotificationResponse] = Field(
        ...,
        description="List of notifications.",
    )
    total: int = Field(
        ...,
        description="Total number of notifications matching the query.",
    )
