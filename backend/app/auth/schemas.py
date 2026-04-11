from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class LoginRequest(BaseModel):
    """Authenticate an adult user (parent, instructor, or admin) with email and password."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"email": "jane@example.com", "password": "secureP@ss123"},
            ]
        }
    )

    email: EmailStr = Field(
        ...,
        description="User's email address",
        examples=["jane@example.com"],
    )
    password: str = Field(
        ...,
        description="Account password",
        examples=["secureP@ss123"],
    )


class StudentLoginRequest(BaseModel):
    """Authenticate a student. Two modes:
    1. **Tenant-scoped** (young kids): username + password + tenant_slug or tenant_code
    2. **Global** (teens/adults): email + password
    """

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "username": "alex_r",
                    "password": "student123",
                    "tenant_slug": "robotics-academy",
                },
                {"email": "alex@school.edu", "password": "student123"},
            ]
        }
    )

    username: str | None = Field(
        None,
        description="Student username (for tenant-scoped login)",
        examples=["alex_r"],
    )
    tenant_slug: str | None = Field(
        None,
        description="Tenant URL slug (e.g. from subdomain)",
        examples=["robotics-academy"],
    )
    tenant_code: str | None = Field(
        None,
        description="Short tenant code (e.g. from whiteboard)",
        examples=["ROBO2024"],
    )
    email: EmailStr | None = Field(
        None,
        description="Student email (for global account login)",
        examples=["alex@school.edu"],
    )
    password: str = Field(
        ...,
        min_length=1,
        description="Student password",
    )

    @model_validator(mode="after")
    def validate_mode(self) -> "StudentLoginRequest":
        has_tenant = bool(self.tenant_slug or self.tenant_code)
        tenant_scoped = self.username and has_tenant
        global_mode = self.email is not None
        if not tenant_scoped and not global_mode:
            raise ValueError(
                "Either (username + tenant_slug/tenant_code) or email required for student login"
            )
        if tenant_scoped and global_mode:
            raise ValueError(
                "Cannot use both tenant-scoped and global login in same request"
            )
        return self


class RegisterRequest(BaseModel):
    """Register a new adult user account (parent, instructor, or admin)."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "email": "jane@example.com",
                    "password": "secureP@ss123",
                    "first_name": "Jane",
                    "last_name": "Smith",
                },
            ]
        }
    )

    email: EmailStr = Field(
        ...,
        description="Email address (must be unique)",
        examples=["jane@example.com"],
    )
    password: str = Field(
        ...,
        min_length=8,
        description="Password (min 8 characters)",
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


class TokenResponse(BaseModel):
    """JWT token pair returned after successful authentication."""

    access_token: str = Field(
        ...,
        description="Short-lived JWT access token (30 min)",
    )
    refresh_token: str = Field(
        ...,
        description="Long-lived refresh token (7 days)",
    )
    token_type: str = Field(
        default="bearer",
        description="Token type (always 'bearer')",
    )


class LoginUserInfo(BaseModel):
    """User info returned in login response for immediate UI display."""

    id: UUID = Field(..., description="User UUID")
    email: str = Field(..., description="Email address")
    first_name: str = Field(..., description="First name")
    last_name: str = Field(..., description="Last name")
    sub_type: str = Field(default="user", description="Identity type")
    role: str | None = Field(default=None, description="Role slug")
    is_super_admin: bool = Field(default=False, description="Platform admin flag")
    tenant_id: str | None = Field(default=None, description="Tenant UUID")
    tenant_slug: str | None = Field(default=None, description="Tenant slug")


class LoginResponse(BaseModel):
    """Login response with tokens and user profile for immediate display."""

    access_token: str = Field(
        ...,
        description="Short-lived JWT access token (30 min)",
    )
    refresh_token: str = Field(
        ...,
        description="Long-lived refresh token (7 days)",
    )
    token_type: str = Field(
        default="bearer",
        description="Token type (always 'bearer')",
    )
    user: LoginUserInfo | None = Field(
        default=None,
        description="User profile for immediate UI display (adult login only)",
    )


class RefreshRequest(BaseModel):
    """Exchange a refresh token for a new access token."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"refresh_token": "eyJhbGciOiJIUzI1NiIs..."},
            ]
        }
    )

    refresh_token: str = Field(
        ...,
        min_length=1,
        description="The refresh token from login or previous refresh",
    )


class LogoutRequest(BaseModel):
    """Body for logout -- refresh_token is required so both tokens are revoked."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"refresh_token": "eyJhbGciOiJIUzI1NiIs..."},
            ]
        }
    )

    refresh_token: str = Field(
        ...,
        min_length=1,
        description="The refresh token to revoke alongside the access token",
    )


class LogoutAllResponse(BaseModel):
    """Response for the logout-all-devices endpoint."""

    detail: str = Field(
        default="All sessions revoked",
        description="Confirmation message",
    )
    revoked_count: int = Field(
        ...,
        description="Number of active sessions that were revoked",
    )


class UserProfile(BaseModel):
    """Current adult user profile returned by GET /me."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="User UUID")
    email: str = Field(..., description="Email address")
    first_name: str = Field(..., description="First name")
    last_name: str = Field(..., description="Last name")
    is_active: bool = Field(..., description="Whether the account is active")
    is_super_admin: bool = Field(
        ...,
        description="Whether the user is a STEMplitude platform admin",
    )
    sub_type: str = Field(
        default="user",
        description="Identity type (always 'user' for adult accounts)",
    )
    role: str | None = Field(
        default=None,
        description="Role slug for the user's current tenant membership",
    )
    tenant_id: UUID | None = Field(
        default=None,
        description="Current tenant ID",
    )
    tenant_slug: str | None = Field(
        default=None,
        description="Current tenant slug",
    )
    tenant_name: str | None = Field(
        default=None,
        description="Current tenant display name",
    )
    global_role: str | None = Field(
        default=None,
        description="Global (non-tenant) role slug, e.g. platform_owner",
    )
    global_permissions: list[str] = Field(
        default_factory=list,
        description="List of global permission strings, e.g. ['platform.tasks:view']",
    )


class StudentProfile(BaseModel):
    """Current student profile returned by GET /me for student tokens."""

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
        description="Display name / nickname",
    )
    global_account: bool = Field(
        ...,
        description="True if this is a global (email-based) account",
    )
    is_active: bool = Field(..., description="Whether the account is active")
    sub_type: str = Field(
        default="student",
        description="Identity type (always 'student')",
    )
    tenant_id: UUID | None = Field(
        default=None,
        description="Current tenant ID for tenant-scoped student sessions",
    )
    tenant_slug: str | None = Field(
        default=None,
        description="Current tenant slug for tenant-scoped student sessions",
    )
    tenant_name: str | None = Field(
        default=None,
        description="Current tenant display name for tenant-scoped student sessions",
    )
    resolved_ui_mode: str | None = Field(
        None,
        description="Resolved UI mode: kids, explorer, or pro (from student override > tenant setting > age default)",
    )
    ui_mode_source: str | None = Field(
        None,
        description="Source of the resolved mode: student, tenant, or age",
    )


class TenantInfo(BaseModel):
    """Basic tenant info for the student tenant picker after global login."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Tenant UUID")
    name: str = Field(..., description="Organization name")
    slug: str = Field(
        ...,
        description="URL slug / subdomain identifier",
    )
    code: str = Field(..., description="Short login code")
    logo_url: str | None = Field(
        None,
        description="Organization logo URL",
    )


class OnboardOrganization(BaseModel):
    """Organization details for the onboarding flow."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Organization display name",
        examples=["Robotics Academy"],
    )
    slug: str = Field(
        ...,
        min_length=1,
        max_length=100,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
        description="URL-safe identifier (lowercase, hyphens only)",
        examples=["robotics-academy"],
    )
    type: str = Field(
        default="center",
        max_length=50,
        description="Organization type: 'center' (learning center) or 'parent' (homeschool)",
        examples=["center", "parent"],
    )


class OnboardRequest(BaseModel):
    """Create a new account and organization in one step.

    Used by the frontend onboarding wizard (Step 1: account info, Step 2: org info).
    The user is created, the organization is provisioned, default roles are seeded,
    and the user is assigned as the owner -- all atomically.
    """

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "email": "jane@example.com",
                    "password": "secureP@ss123",
                    "first_name": "Jane",
                    "last_name": "Smith",
                    "organization": {
                        "name": "Robotics Academy",
                        "slug": "robotics-academy",
                        "type": "center",
                    },
                },
            ]
        }
    )

    email: EmailStr = Field(
        ...,
        description="Email address (must be unique)",
        examples=["jane@example.com"],
    )
    password: str = Field(
        ...,
        min_length=8,
        description="Password (min 8 characters)",
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
    organization: OnboardOrganization = Field(
        ...,
        description="Organization to create (the user becomes the owner)",
    )


class OnboardResponse(BaseModel):
    """Returned after successful onboarding -- tokens + tenant info for immediate use."""

    access_token: str = Field(..., description="Short-lived JWT access token")
    refresh_token: str = Field(..., description="Long-lived refresh token")
    token_type: str = Field(default="bearer", description="Token type")
    tenant_id: UUID = Field(..., description="ID of the newly created organization")
    tenant_slug: str = Field(..., description="URL slug of the organization")
    tenant_name: str = Field(..., description="Display name of the organization")


class AvailabilityResponse(BaseModel):
    """Response for email / slug availability checks."""

    value: str = Field(..., description="The value that was checked")
    available: bool = Field(..., description="Whether the value is available")
    message: str | None = Field(None, description="Human-readable reason if unavailable")


class ImpersonateRequest(BaseModel):
    """Request for a super admin to impersonate a user within a tenant for support purposes."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "user_id": "550e8400-e29b-41d4-a716-446655440000",
                    "tenant_id": "660e8400-e29b-41d4-a716-446655440000",
                    "grant_id": "770e8400-e29b-41d4-a716-446655440000",
                },
            ]
        }
    )

    user_id: UUID = Field(
        ...,
        description="UUID of the user to impersonate",
    )
    tenant_id: UUID = Field(
        ...,
        description="UUID of the tenant to access",
    )
    grant_id: UUID | None = Field(
        None,
        description="Optional tenant-approved support access grant UUID",
    )
