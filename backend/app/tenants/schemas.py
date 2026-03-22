"""Tenant schemas."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# --- Tenant ---


class TenantCreate(BaseModel):
    """Create a new tenant organization (learning center, homeschool, etc.)."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "name": "Robotics Academy",
                    "slug": "robotics-academy",
                    "code": "ROBO2024",
                    "type": "center",
                    "logo_url": "https://example.com/logo.png",
                    "settings": {},
                }
            ]
        }
    )

    name: str = Field(
        ..., min_length=1, max_length=200,
        description="Display name of the organization",
        examples=["Robotics Academy", "STEM Kids Club"],
    )
    slug: str = Field(
        ..., min_length=1, max_length=100,
        description="URL-safe identifier, used as subdomain (e.g. robotics-academy.stemplitude.com)",
        examples=["robotics-academy", "stem-kids"],
    )
    code: str = Field(
        ..., min_length=4, max_length=20,
        description="Short alphanumeric code for student login (e.g. written on a whiteboard)",
        examples=["ROBO2024", "STEMKIDS"],
    )
    type: str = Field(
        default="center", max_length=50,
        description="Tenant type: 'center' (learning center) or 'parent' (homeschool family)",
        examples=["center", "parent"],
    )
    logo_url: str | None = Field(
        None, max_length=500,
        description="URL to the organization's logo image",
    )
    settings: dict | None = Field(
        None,
        description="Optional tenant settings (timezone, language, etc.)",
    )


class TenantUpdate(BaseModel):
    """Update an existing tenant. Only provided fields are changed."""

    name: str | None = Field(None, min_length=1, max_length=200, description="Display name")
    slug: str | None = Field(None, min_length=1, max_length=100, description="URL-safe identifier")
    code: str | None = Field(None, min_length=4, max_length=20, description="Short login code")
    type: str | None = Field(None, max_length=50, description="Tenant type")
    logo_url: str | None = Field(None, max_length=500, description="Logo image URL")
    settings: dict | None = Field(None, description="Tenant settings")
    is_active: bool | None = Field(None, description="Whether the tenant is active")


class TenantResponse(BaseModel):
    """Full tenant details."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Tenant UUID")
    name: str = Field(..., description="Display name")
    slug: str = Field(..., description="URL slug / subdomain identifier")
    code: str = Field(..., description="Short student login code")
    type: str = Field(..., description="Tenant type (center or parent)")
    logo_url: str | None = Field(None, description="Logo image URL")
    settings: dict | None = Field(None, description="Tenant settings (timezone, language, policies)")
    is_active: bool = Field(..., description="Whether the tenant is active")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class TenantListResponse(BaseModel):
    """Paginated list of tenants."""

    items: list[TenantResponse] = Field(..., description="List of tenants")
    total: int = Field(..., description="Total number of tenants")


# --- Student policies (stored in tenant.settings) ---


class StudentPolicies(BaseModel):
    """Student account policies for a tenant, controlling self-registration and enrollment rules."""

    allow_self_registration: bool = Field(False, description="Allow students to create their own accounts")
    require_approval: bool = Field(True, description="Require admin approval for new student accounts")
    max_projects_per_student: int | None = Field(None, description="Maximum projects per student (null = unlimited)")
    default_role_slug: str | None = Field("student", description="Default role assigned to new students")


class StudentPoliciesUpdate(BaseModel):
    """Update student account policies. Only provided fields are changed."""

    model_config = ConfigDict(json_schema_extra={"examples": [{"allow_self_registration": True, "require_approval": False}]})

    allow_self_registration: bool | None = Field(None, description="Allow students to create their own accounts")
    require_approval: bool | None = Field(None, description="Require admin approval for new student accounts")
    max_projects_per_student: int | None = Field(None, description="Maximum projects per student")
    default_role_slug: str | None = Field(None, description="Default role for new students")


# --- Tenant UI settings (stored in tenant.settings["ui"]) ---


class TenantUISettings(BaseModel):
    """UI display settings for a tenant, controlling which visual mode students see."""

    ui_mode: Literal["auto", "kids", "explorer", "pro"] = Field(
        "auto",
        description=(
            "Student UI mode: 'auto' resolves from student age, "
            "'kids' (5-10), 'explorer' (11-16), 'pro' (17+/polytechnic)"
        ),
    )


class TenantUISettingsUpdate(BaseModel):
    """Update tenant UI settings."""

    ui_mode: Literal["auto", "kids", "explorer", "pro"] | None = Field(
        None, description="Override the default UI mode for all students in this tenant",
    )


# --- Parent policies (stored in tenant.settings["parent_policies"]) ---


class ParentPolicies(BaseModel):
    """Controls what parents are allowed to do within this tenant."""

    allow_cancel: bool = Field(False, description="Allow parents to cancel scheduled sessions")
    allow_reschedule: bool = Field(False, description="Allow parents to reschedule sessions")
    cancel_deadline_hours: int = Field(24, ge=0, description="Minimum hours before session start to allow cancellation")


class ParentPoliciesUpdate(BaseModel):
    """Update parent policies. Only provided fields are changed."""

    allow_cancel: bool | None = Field(None, description="Allow parents to cancel sessions")
    allow_reschedule: bool | None = Field(None, description="Allow parents to reschedule sessions")
    cancel_deadline_hours: int | None = Field(None, ge=0, description="Minimum hours before session to allow cancel")


# --- Membership ---


class MemberAdd(BaseModel):
    """Add an adult user as a member of this tenant with a specific role."""

    model_config = ConfigDict(json_schema_extra={"examples": [{"user_id": "550e8400-e29b-41d4-a716-446655440000", "role_id": "660e8400-e29b-41d4-a716-446655440000"}]})

    user_id: UUID = Field(..., description="UUID of the user to add")
    role_id: UUID = Field(..., description="UUID of the role to assign (owner, admin, instructor, parent, or custom)")


class MemberRoleUpdate(BaseModel):
    """Change a member's role within the tenant."""

    model_config = ConfigDict(json_schema_extra={"examples": [{"role_id": "660e8400-e29b-41d4-a716-446655440000"}]})

    role_id: UUID = Field(..., description="UUID of the new role to assign")


class MemberResponse(BaseModel):
    """Membership record."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Membership UUID")
    user_id: UUID = Field(..., description="User UUID")
    tenant_id: UUID = Field(..., description="Tenant UUID")
    role_id: UUID | None = Field(None, description="Assigned role UUID")
    is_active: bool = Field(..., description="Whether the membership is active")


class MemberWithUserResponse(BaseModel):
    """Membership with user profile details for listing."""

    id: UUID = Field(..., description="Membership UUID")
    user_id: UUID = Field(..., description="User UUID")
    tenant_id: UUID = Field(..., description="Tenant UUID")
    role_id: UUID | None = Field(None, description="Assigned role UUID")
    is_active: bool = Field(..., description="Whether the membership is active")
    email: str = Field(..., description="User's email address")
    first_name: str = Field(..., description="User's first name")
    last_name: str = Field(..., description="User's last name")
    role_slug: str | None = Field(None, description="Role slug (e.g. owner, admin, instructor)")


# --- Lab settings ---


class LabSettingResponse(BaseModel):
    """Lab enablement setting for a tenant."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Setting UUID")
    tenant_id: UUID = Field(..., description="Tenant UUID")
    lab_type: str = Field(..., description="Lab type identifier (e.g. robotics_lab, game_maker)")
    enabled: bool = Field(..., description="Whether this lab is enabled for students")
    config: dict | None = Field(None, description="Optional lab-specific configuration")
    updated_at: datetime = Field(..., description="Last update timestamp")


class LabSettingUpdate(BaseModel):
    """Toggle a lab on or off for a tenant's students."""

    model_config = ConfigDict(json_schema_extra={"examples": [{"lab_type": "robotics_lab", "enabled": True}]})

    lab_type: str = Field(..., max_length=50, description="Lab type to toggle (e.g. robotics_lab, game_maker, 3d_designer, electronics_lab, python_lab, ai_lab)", examples=["robotics_lab", "game_maker"])
    enabled: bool = Field(True, description="Whether to enable or disable the lab")
    config: dict | None = Field(None, description="Optional lab-specific configuration overrides")


class LabSettingsListResponse(BaseModel):
    """All lab settings for a tenant."""

    items: list[LabSettingResponse] = Field(..., description="List of lab settings")


# --- Support access ---


class SupportAccessGrantCreate(BaseModel):
    """Grant time-limited support access to a STEMplitude staff member for troubleshooting."""

    model_config = ConfigDict(json_schema_extra={"examples": [{"support_user_id": "550e8400-e29b-41d4-a716-446655440000", "role_id": "660e8400-e29b-41d4-a716-446655440000", "reason": "Investigating billing sync issue", "expires_at": "2026-03-15T12:00:00Z"}]})

    support_user_id: UUID = Field(..., description="UUID of the support staff member (must be a super admin)")
    role_id: UUID | None = Field(None, description="Role to grant within this tenant (determines what the support user can do)")
    reason: str | None = Field(None, max_length=500, description="Reason for granting access (visible to tenant admins)")
    expires_at: datetime = Field(..., description="When this access grant expires (ISO 8601)")


class SupportAccessGrantResponse(BaseModel):
    """Support access grant details."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Grant UUID")
    tenant_id: UUID = Field(..., description="Tenant being accessed")
    granted_by: UUID = Field(..., description="User who granted access")
    support_user_id: UUID = Field(..., description="Support staff member UUID")
    role_id: UUID | None = Field(None, description="Role assigned to the support user")
    status: str = Field(..., description="Grant status: active, expired, or revoked")
    reason: str | None = Field(None, description="Reason for the access grant")
    expires_at: datetime = Field(..., description="Expiration timestamp")
    revoked_at: datetime | None = Field(None, description="When the grant was revoked (null if still active)")
    revoked_by: UUID | None = Field(None, description="User who revoked the grant")
    created_at: datetime = Field(..., description="Creation timestamp")


class SupportAccessListResponse(BaseModel):
    """List of support access grants for a tenant."""

    items: list[SupportAccessGrantResponse] = Field(..., description="List of support access grants")


class SupportAccessUserOption(BaseModel):
    """Selectable support staff member for tenant-granted access."""

    id: UUID
    email: str
    first_name: str
    last_name: str
    global_role: str | None = None


class SupportAccessRoleOption(BaseModel):
    """Selectable tenant role scope for support access."""

    id: UUID
    slug: str
    name: str


class SupportAccessOptionsResponse(BaseModel):
    """Options needed to create a scoped support access grant."""

    support_users: list[SupportAccessUserOption]
    roles: list[SupportAccessRoleOption]


# --- Tenant hierarchy (two-level parent → child) ---


class ChildTenantCreate(BaseModel):
    """Link an existing tenant as a child, or provide details to create one.
    billing_mode controls who pays: 'central' (parent pays) or 'independent' (child pays).
    seat_allocations is optional -- only meaningful for central billing.
    """

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "child_tenant_id": "550e8400-e29b-41d4-a716-446655440000",
                    "billing_mode": "central",
                    "seat_allocations": {"student": 100, "instructor": 5},
                },
                {
                    "child_tenant_id": "660e8400-e29b-41d4-a716-446655440000",
                    "billing_mode": "independent",
                },
            ]
        }
    )

    child_tenant_id: UUID = Field(..., description="UUID of the tenant to add as a child")
    billing_mode: str = Field(
        default="central",
        description="'central' = parent's license covers the child; 'independent' = child manages its own subscription",
        examples=["central", "independent"],
    )
    seat_allocations: dict[str, int] | None = Field(
        None,
        description="Optional per-seat-type caps for centrally billed children (e.g. {\"student\": 100}). "
        "If null, the child draws from the parent's total pool.",
        examples=[{"student": 100, "instructor": 5}],
    )


class HierarchyUpdate(BaseModel):
    """Update the billing mode or seat allocations for a child tenant."""

    model_config = ConfigDict(
        json_schema_extra={"examples": [{"billing_mode": "independent", "seat_allocations": None}]}
    )

    billing_mode: str | None = Field(
        None,
        description="Change billing mode: 'central' or 'independent'",
        examples=["central", "independent"],
    )
    seat_allocations: dict[str, int] | None = Field(
        None,
        description="Update seat caps (set to null to remove allocation and use parent's pool)",
    )
    is_active: bool | None = Field(None, description="Deactivate or reactivate the link")


class HierarchyResponse(BaseModel):
    """Parent→child tenant relationship details."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(..., description="Hierarchy link UUID")
    parent_tenant_id: UUID = Field(..., description="Parent tenant UUID")
    child_tenant_id: UUID = Field(..., description="Child tenant UUID")
    billing_mode: str = Field(..., description="'central' or 'independent'")
    seat_allocations: dict[str, int] | None = Field(
        None, description="Per-seat-type caps (null = draws from parent pool)"
    )
    is_active: bool = Field(..., description="Whether the link is active")
    created_at: datetime = Field(..., description="When the link was created")
    updated_at: datetime = Field(..., description="Last update timestamp")


class HierarchyListResponse(BaseModel):
    """List of child tenants for a parent."""

    items: list[HierarchyResponse] = Field(..., description="Child tenant links")
    total: int = Field(..., description="Total number of children")


# --- Seat monitoring ---


class ChildSeatUsage(BaseModel):
    """Seat usage snapshot for a single child tenant."""

    child_tenant_id: UUID = Field(..., description="Child tenant UUID")
    child_name: str = Field(..., description="Child tenant display name")
    billing_mode: str = Field(..., description="'central' or 'independent'")
    seats: dict[str, "SeatDetail"] = Field(
        default_factory=dict,
        description="Seat usage per type (e.g. student, instructor)",
    )


class SeatDetail(BaseModel):
    """Current vs max for a single seat type."""

    current: int = Field(..., description="Number of seats currently in use")
    allocated: int | None = Field(
        None, description="Seat cap from hierarchy allocation (null = no cap, uses parent pool)"
    )
    max_from_license: int | None = Field(
        None, description="Max seats from the effective license (child's own or parent's)"
    )


class SeatMonitorResponse(BaseModel):
    """Aggregate seat monitoring dashboard for a parent tenant."""

    parent_tenant_id: UUID = Field(..., description="Parent tenant UUID")
    parent_license_seats: dict[str, int] = Field(
        default_factory=dict,
        description="Max seats from the parent's license per type",
    )
    total_allocated: dict[str, int] = Field(
        default_factory=dict,
        description="Sum of seat allocations across all centrally-billed children",
    )
    total_used: dict[str, int] = Field(
        default_factory=dict,
        description="Sum of seats currently in use across all centrally-billed children",
    )
    unallocated: dict[str, int] = Field(
        default_factory=dict,
        description="Remaining unallocated seats (parent max - total allocated)",
    )
    children: list[ChildSeatUsage] = Field(
        default_factory=list, description="Per-child breakdown"
    )
