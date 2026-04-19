"""Messaging schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ── Direct message schemas (kept for backward compat) ─────────────────────────

class MessageCreate(BaseModel):
    """Send a direct message to another user within the tenant."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "recipient_id": "550e8400-e29b-41d4-a716-446655440000",
                    "subject": "Homework reminder",
                    "body": "Please complete the Robo Maker lab by Friday.",
                }
            ]
        }
    )

    recipient_id: UUID = Field(..., description="UUID of the message recipient")
    subject: str | None = Field(None, max_length=200, description="Message subject line (optional)")
    body: str = Field(..., min_length=1, description="Message body text")


class MessageUpdate(BaseModel):
    """Mark a message as read or unread."""

    model_config = ConfigDict(json_schema_extra={"examples": [{"is_read": True}]})

    is_read: bool | None = Field(None, description="Set to true to mark as read, false for unread")


class MessageResponse(BaseModel):
    """Direct message details."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Message UUID")
    sender_id: UUID = Field(..., description="UUID of the sender")
    recipient_id: UUID | None = Field(None, description="UUID of the recipient")
    tenant_id: UUID = Field(..., description="Tenant UUID")
    subject: str | None = Field(None, description="Message subject")
    body: str = Field(..., description="Message body text")
    is_read: bool = Field(..., description="Whether the recipient has read the message")
    created_at: datetime = Field(..., description="When the message was sent")


class MessageListResponse(BaseModel):
    """Paginated list of messages."""

    items: list[MessageResponse] = Field(..., description="List of messages")
    total: int = Field(..., description="Total number of messages matching the query")


# ── Conversation schemas ───────────────────────────────────────────────────────

class MemberInfo(BaseModel):
    """Member of a conversation."""

    user_id: UUID
    name: str
    joined_at: datetime
    left_at: datetime | None = None


class ConversationMessageInfo(BaseModel):
    """A message within a conversation."""

    id: UUID
    conversation_id: UUID
    sender_id: UUID
    sender_name: str
    body: str
    message_type: str  # 'text' | 'system'
    is_read: bool
    created_at: datetime


class ConversationSummary(BaseModel):
    """Summary of a conversation for the sidebar list."""

    id: UUID
    type: str  # 'dm' | 'group'
    name: str | None = None
    classroom_id: UUID | None = None
    display_name: str  # Resolved: other person's name for DM, class name for group
    members: list[MemberInfo] = Field(default_factory=list)
    last_message: ConversationMessageInfo | None = None
    unread_count: int = 0
    created_at: datetime
    updated_at: datetime


class ConversationListResponse(BaseModel):
    """Paginated list of conversations."""

    items: list[ConversationSummary]
    total: int
    skip: int = 0
    limit: int = 50


class ConversationMessageListResponse(BaseModel):
    """Paginated list of messages in a conversation."""

    items: list[ConversationMessageInfo]
    total: int


class SendConversationMessage(BaseModel):
    """Send a message to a conversation."""

    body: str = Field(..., min_length=1, max_length=4000)


class CreateDmConversation(BaseModel):
    """Create or open a direct-message conversation."""

    recipient_id: UUID


class CreateGroupConversation(BaseModel):
    """Create a custom group conversation."""

    name: str = Field(..., min_length=1, max_length=200)
    member_ids: list[UUID] = Field(default_factory=list)


class UpdateConversation(BaseModel):
    """Rename a group conversation."""

    name: str = Field(..., min_length=1, max_length=200)


class AddGroupMembers(BaseModel):
    """Add one or more users to a group conversation."""

    user_ids: list[UUID] = Field(..., min_length=1)
