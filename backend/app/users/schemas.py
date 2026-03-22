"""User schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    """Schema for creating a user (kept for completeness)."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "email": "jane@example.com",
                    "password": "secureP@ss123",
                    "first_name": "Jane",
                    "last_name": "Smith",
                    "phone": "+1-555-0123",
                    "timezone": "America/New_York",
                    "language": "en",
                },
            ]
        }
    )

    email: EmailStr = Field(
        ...,
        description="User's email address (must be unique)",
        examples=["jane@example.com"],
    )
    password: str = Field(
        ...,
        min_length=8,
        description="Account password (min 8 characters)",
        examples=["secureP@ss123"],
    )
    first_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="First name",
        examples=["Jane"],
    )
    last_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Last name",
        examples=["Smith"],
    )
    phone: str | None = Field(
        None,
        max_length=20,
        description="Phone number",
        examples=["+1-555-0123"],
    )
    avatar_url: str | None = Field(
        None,
        max_length=500,
        description="URL to user's avatar image",
    )
    timezone: str | None = Field(
        None,
        max_length=50,
        description="IANA timezone (e.g. America/New_York)",
        examples=["America/New_York"],
    )
    language: str | None = Field(
        None,
        max_length=10,
        description="Preferred language code (e.g. en, es)",
        examples=["en"],
    )
    is_active: bool = Field(
        True,
        description="Whether the account is active",
    )


class UserUpdate(BaseModel):
    """Schema for updating user profile (timezone, language, etc.)."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "first_name": "Jane",
                    "last_name": "Smith",
                    "phone": "+1-555-0123",
                    "timezone": "America/New_York",
                    "language": "en",
                },
            ]
        }
    )

    first_name: str | None = Field(
        None,
        min_length=1,
        max_length=100,
        description="First name",
        examples=["Jane"],
    )
    last_name: str | None = Field(
        None,
        min_length=1,
        max_length=100,
        description="Last name",
        examples=["Smith"],
    )
    phone: str | None = Field(
        None,
        max_length=20,
        description="Phone number",
        examples=["+1-555-0123"],
    )
    avatar_url: str | None = Field(
        None,
        max_length=500,
        description="URL to user's avatar image",
    )
    timezone: str | None = Field(
        None,
        max_length=50,
        description="IANA timezone (e.g. America/New_York)",
        examples=["America/New_York"],
    )
    language: str | None = Field(
        None,
        max_length=10,
        description="Preferred language code (e.g. en, es)",
        examples=["en"],
    )
    is_active: bool | None = Field(
        None,
        description="Whether the account is active",
    )


class UserResponse(BaseModel):
    """User response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="User UUID")
    email: str = Field(..., description="Email address")
    first_name: str = Field(..., description="First name")
    last_name: str = Field(..., description="Last name")
    phone: str | None = Field(
        None,
        description="Phone number",
    )
    avatar_url: str | None = Field(
        None,
        description="URL to user's avatar image",
    )
    timezone: str | None = Field(
        None,
        description="IANA timezone",
    )
    language: str | None = Field(
        None,
        description="Preferred language code",
    )
    is_active: bool = Field(..., description="Whether the account is active")
    is_super_admin: bool = Field(
        ...,
        description="Whether the user is a platform super admin",
    )
    created_at: datetime = Field(
        ...,
        description="Account creation timestamp",
    )
    updated_at: datetime = Field(
        ...,
        description="Last update timestamp",
    )


class UserListResponse(BaseModel):
    """Paginated user list response."""

    items: list[UserResponse] = Field(
        ...,
        description="List of user records",
    )
    total: int = Field(
        ...,
        description="Total number of users matching the query",
    )
