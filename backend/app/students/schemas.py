from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class StudentCreate(BaseModel):
    """Create tenant-scoped student (by parent or instructor)."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "first_name": "Alex",
                    "last_name": "Rivera",
                    "username": "alex_r",
                    "password": "student123",
                    "grade_level": "5th",
                },
            ]
        }
    )

    first_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Student's first name",
        examples=["Alex"],
    )
    last_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Student's last name",
        examples=["Rivera"],
    )
    email: EmailStr | None = Field(
        None,
        description="Student email (optional for tenant-scoped accounts)",
        examples=["alex@school.edu"],
    )
    password: str = Field(
        ...,
        min_length=8,
        description="Student password (min 8 characters)",
        examples=["student123"],
    )
    display_name: str | None = Field(
        None,
        max_length=100,
        description="Display name or nickname",
    )
    date_of_birth: date | None = Field(
        None,
        description="Student's date of birth",
    )
    username: str | None = Field(
        None,
        max_length=100,
        description="Username within the tenant (must be unique per tenant)",
        examples=["alex_r"],
    )
    grade_level: str | None = Field(
        None,
        max_length=20,
        description="Grade level (e.g. 5th, 6th, middle school)",
        examples=["5th"],
    )


class StudentSelfRegister(BaseModel):
    """Student self-registration (no auth required)."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "first_name": "Alex",
                    "last_name": "Rivera",
                    "email": "alex@school.edu",
                    "password": "student123",
                    "username": "alex_r",
                    "tenant_slug": "robotics-academy",
                    "grade_level": "5th",
                },
            ]
        }
    )

    first_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Student's first name",
        examples=["Alex"],
    )
    last_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Student's last name",
        examples=["Rivera"],
    )
    email: EmailStr | None = Field(
        None,
        description="Student email (for global accounts)",
        examples=["alex@school.edu"],
    )
    password: str = Field(
        ...,
        min_length=8,
        description="Student password (min 8 characters)",
        examples=["student123"],
    )
    display_name: str | None = Field(
        None,
        max_length=100,
        description="Display name or nickname",
    )
    date_of_birth: date | None = Field(
        None,
        description="Student's date of birth",
    )
    username: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Username within the tenant (must be unique per tenant)",
        examples=["alex_r"],
    )
    tenant_slug: str | None = Field(
        None,
        description="Tenant URL slug (identifies the organization)",
        examples=["robotics-academy"],
    )
    tenant_code: str | None = Field(
        None,
        description="Short tenant code (alternative to tenant_slug)",
        examples=["ROBO2024"],
    )
    grade_level: str | None = Field(
        None,
        max_length=20,
        description="Grade level (e.g. 5th, 6th)",
        examples=["5th"],
    )


class StudentUpdate(BaseModel):
    """Update student profile."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "first_name": "Alex",
                    "last_name": "Rivera",
                    "display_name": "Alex R.",
                    "is_active": True,
                },
            ]
        }
    )

    first_name: str | None = Field(
        None,
        min_length=1,
        max_length=100,
        description="Student's first name",
    )
    last_name: str | None = Field(
        None,
        min_length=1,
        max_length=100,
        description="Student's last name",
    )
    email: EmailStr | None = Field(
        None,
        description="Student email",
    )
    display_name: str | None = Field(
        None,
        max_length=100,
        description="Display name or nickname",
    )
    date_of_birth: date | None = Field(
        None,
        description="Student's date of birth",
    )
    avatar_url: str | None = Field(
        None,
        max_length=500,
        description="URL to student's avatar image",
    )
    is_active: bool | None = Field(
        None,
        description="Whether the student account is active",
    )


class StudentProfile(BaseModel):
    """Student profile response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Student UUID")
    first_name: str = Field(..., description="First name")
    last_name: str = Field(..., description="Last name")
    email: str | None = Field(
        None,
        description="Email (present for global accounts)",
    )
    display_name: str | None = Field(
        None,
        description="Display name or nickname",
    )
    date_of_birth: date | None = Field(
        None,
        description="Date of birth",
    )
    avatar_url: str | None = Field(
        None,
        description="URL to avatar image",
    )
    global_account: bool = Field(
        ...,
        description="True if this is a global (email-based) account",
    )
    is_active: bool = Field(
        ...,
        description="Whether the account is active",
    )


class StudentMembershipCreate(BaseModel):
    """Enroll student in another tenant."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
                    "username": "alex_r",
                    "grade_level": "5th",
                    "role": "student",
                },
            ]
        }
    )

    tenant_id: UUID = Field(
        ...,
        description="UUID of the tenant to enroll the student in",
    )
    username: str | None = Field(
        None,
        max_length=100,
        description="Username within this tenant (unique per tenant)",
        examples=["alex_r"],
    )
    grade_level: str | None = Field(
        None,
        max_length=20,
        description="Grade level in this tenant",
        examples=["5th"],
    )
    role: str = Field(
        default="student",
        max_length=20,
        description="Role within the tenant",
        examples=["student"],
    )


class StudentMembershipResponse(BaseModel):
    """Student membership response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Membership UUID")
    student_id: UUID = Field(..., description="Student UUID")
    tenant_id: UUID = Field(..., description="Tenant UUID")
    username: str | None = Field(
        None,
        description="Username within this tenant",
    )
    grade_level: str | None = Field(
        None,
        description="Grade level in this tenant",
    )
    role: str = Field(..., description="Role within the tenant")
    is_active: bool = Field(
        ...,
        description="Whether the membership is active",
    )


class StudentLinkRequest(BaseModel):
    """Merge two student records (link/merge duplicate accounts)."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "target_student_id": "770e8400-e29b-41d4-a716-446655440000",
                },
            ]
        }
    )

    target_student_id: UUID = Field(
        ...,
        description="UUID of the student record to merge into the current student",
    )


class ParentLinkRequest(BaseModel):
    """Link a parent (adult user) to a student."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "user_id": "550e8400-e29b-41d4-a716-446655440000",
                    "relationship": "parent",
                    "is_primary_contact": True,
                },
            ]
        }
    )

    user_id: UUID = Field(
        ...,
        description="UUID of the adult user (parent) to link",
    )
    relationship: str = Field(
        default="parent",
        max_length=50,
        description="Relationship type (e.g. parent, guardian)",
        examples=["parent"],
    )
    is_primary_contact: bool = Field(
        default=False,
        description="Whether this parent is the primary contact",
    )


class ParentResponse(BaseModel):
    """Parent link response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Parent-student link UUID")
    user_id: UUID = Field(..., description="Parent (user) UUID")
    student_id: UUID = Field(..., description="Student UUID")
    relationship: str = Field(
        ...,
        description="Relationship type",
    )
    is_primary_contact: bool = Field(
        ...,
        description="Whether this parent is the primary contact",
    )
    user_email: str | None = Field(
        None,
        description="Guardian email when loaded for admin UIs (billing, comms).",
    )


class ResetPasswordRequest(BaseModel):
    """Reset student password."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"new_password": "newSecure123"},
            ]
        }
    )

    new_password: str = Field(
        ...,
        min_length=8,
        description="New password (min 8 characters)",
        examples=["newSecure123"],
    )


class UsernameCheckResponse(BaseModel):
    """Username availability check response."""

    available: bool = Field(
        ...,
        description="True if the username is available for use",
    )
    username: str = Field(
        ...,
        description="The username that was checked",
    )


class ParentWeeklyDigest(BaseModel):
    """Rolling-window counts for the parent dashboard."""

    period_start: datetime
    period_end: datetime
    lessons_completed: int
    labs_completed: int
    badges_earned: int
    xp_earned: int
    sessions_attended: int
    assignments_submitted: int = 0


class ParentActivityItem(BaseModel):
    kind: Literal[
        "lesson_completed",
        "lab_completed",
        "assignment_submitted",
        "sticker_earned",
        "xp_earned",
        "attendance",
    ]
    occurred_at: datetime
    title: str
    detail: str | None = None
    ref_id: str | None = None
    classroom_id: str | None = None
    class_name: str | None = None


class ParentChildActivityResponse(BaseModel):
    items: list[ParentActivityItem]
    weekly_digest: ParentWeeklyDigest
    total: int = Field(0, ge=0, description="Total activity events in the merged feed")
    skip: int = 0
    limit: int = 40
