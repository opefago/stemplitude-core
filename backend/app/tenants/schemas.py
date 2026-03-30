"""Tenant schemas."""

from datetime import datetime
from typing import Literal
from uuid import UUID

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.tenants.franchise_governance import GOVERNANCE_MODES

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
    public_host_subdomain: str | None = Field(
        None,
        max_length=63,
        description="DNS label for {label}.{PUBLIC_HOST_BASE_DOMAIN} (lowercase, no dots)",
    )
    custom_domain: str | None = Field(
        None,
        max_length=253,
        description="Full hostname once DNS points at your app (no https://)",
    )
    billing_mode: Literal["live", "test", "internal"] = Field(
        "live",
        description="Billing execution mode for this tenant.",
    )
    billing_email_enabled: bool = Field(
        True,
        description="Whether billing emails are enabled for this tenant.",
    )

    @field_validator("public_host_subdomain", mode="before")
    @classmethod
    def normalize_create_public_subdomain(cls, v: object) -> str | None:
        if v is None or v == "":
            return None
        s = str(v).strip().lower()
        if not re.fullmatch(r"[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?", s):
            raise ValueError("Invalid subdomain label (use letters, numbers, hyphens; 1–63 chars)")
        if s in ("www", "api", "app", "mail", "ftp"):
            raise ValueError("This subdomain label is reserved")
        return s

    @field_validator("custom_domain", mode="before")
    @classmethod
    def normalize_create_custom_domain(cls, v: object) -> str | None:
        if v is None or v == "":
            return None
        s = str(v).strip().lower().split("/")[0].split(":")[0]
        if len(s) < 3 or "." not in s:
            raise ValueError("Enter a valid hostname (e.g. learn.yourschool.org)")
        return s[:253]


class TenantUpdate(BaseModel):
    """Update an existing tenant. Only provided fields are changed."""

    name: str | None = Field(None, min_length=1, max_length=200, description="Display name")
    slug: str | None = Field(None, min_length=1, max_length=100, description="URL-safe identifier")
    code: str | None = Field(None, min_length=4, max_length=20, description="Short login code")
    type: str | None = Field(None, max_length=50, description="Tenant type")
    logo_url: str | None = Field(None, max_length=500, description="Logo image URL")
    settings: dict | None = Field(None, description="Tenant settings")
    billing_mode: Literal["live", "test", "internal"] | None = Field(
        None, description="Billing execution mode"
    )
    billing_email_enabled: bool | None = Field(
        None, description="Whether billing emails are enabled"
    )
    is_active: bool | None = Field(None, description="Whether the tenant is active")
    public_host_subdomain: str | None = Field(
        None,
        max_length=63,
        description="DNS label for {label}.{PUBLIC_HOST_BASE_DOMAIN} (lowercase, no dots)",
    )
    custom_domain: str | None = Field(
        None,
        max_length=253,
        description="Full hostname for this tenant once DNS is pointed at your app (no https://)",
    )

    @field_validator("public_host_subdomain", mode="before")
    @classmethod
    def normalize_public_subdomain(cls, v: object) -> str | None:
        if v is None or v == "":
            return None
        s = str(v).strip().lower()
        if not re.fullmatch(r"[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?", s):
            raise ValueError("Invalid subdomain label (use letters, numbers, hyphens; 1–63 chars)")
        if s in ("www", "api", "app", "mail", "ftp"):
            raise ValueError("This subdomain label is reserved")
        return s

    @field_validator("custom_domain", mode="before")
    @classmethod
    def normalize_custom_domain(cls, v: object) -> str | None:
        if v is None or v == "":
            return None
        s = str(v).strip().lower().split("/")[0].split(":")[0]
        if len(s) < 3 or "." not in s:
            raise ValueError("Enter a valid hostname (e.g. learn.yourschool.org)")
        return s[:253]


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
    billing_mode: Literal["live", "test", "internal"] = Field(
        ..., description="Billing execution mode"
    )
    billing_email_enabled: bool = Field(
        ..., description="Whether billing emails are enabled"
    )
    is_active: bool = Field(..., description="Whether the tenant is active")
    public_host_subdomain: str | None = Field(
        None, description="Public subdomain label when using wildcard DNS on the platform domain"
    )
    custom_domain: str | None = Field(None, description="Custom hostname for this tenant")
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
    governance_mode: str = Field(
        default="child_managed",
        description="child_managed | parent_managed | hybrid | isolated — who owns curriculum, shared libraries, brand, rollups",
        examples=["hybrid"],
    )
    governance: dict | None = Field(
        None,
        description="Optional overrides for expanded policy flags (merged onto defaults for governance_mode)",
    )

    @field_validator("governance_mode", mode="before")
    @classmethod
    def validate_governance_mode(cls, v: object) -> str:
        s = (str(v) if v is not None else "child_managed").strip().lower()
        if s not in GOVERNANCE_MODES:
            raise ValueError(
                f"governance_mode must be one of: {', '.join(sorted(GOVERNANCE_MODES))}"
            )
        return s


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
    governance_mode: str | None = Field(
        None,
        description="child_managed | parent_managed | hybrid | isolated",
    )
    governance: dict | None = Field(
        None,
        description="Optional policy overrides; if governance_mode is set, flags are rebuilt then merged",
    )

    @field_validator("governance_mode", mode="before")
    @classmethod
    def validate_governance_mode_patch(cls, v: object) -> str | None:
        if v is None or v == "":
            return None
        s = str(v).strip().lower()
        if s not in GOVERNANCE_MODES:
            raise ValueError(f"governance_mode must be one of: {', '.join(sorted(GOVERNANCE_MODES))}")
        return s


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
    governance_mode: str = Field(
        ...,
        description="Franchise policy preset: child_managed, parent_managed, hybrid, isolated",
    )
    governance: dict | None = Field(None, description="Expanded flags plus optional overrides")
    created_at: datetime = Field(..., description="When the link was created")
    updated_at: datetime = Field(..., description="Last update timestamp")


class HierarchyListResponse(BaseModel):
    """List of child tenants for a parent."""

    items: list[HierarchyResponse] = Field(..., description="Child tenant links")
    total: int = Field(..., description="Total number of children")


# --- Public host + franchise join requests ---


class PublicTenantByHostResponse(BaseModel):
    """Minimal tenant info for hostname-based SPA bootstrap (no auth)."""

    id: UUID
    name: str
    slug: str
    public_host_subdomain: str | None = None


class FranchiseJoinRequestCreate(BaseModel):
    """Child org admin asks to link under a parent (district / franchisor)."""

    parent_slug: str | None = Field(None, max_length=100)
    parent_tenant_id: UUID | None = None
    message: str | None = Field(None, max_length=1000)
    preferred_billing_mode: str | None = Field(
        None, description="Hint for parent: 'central' or 'independent'"
    )

    @model_validator(mode="after")
    def exactly_one_parent(self) -> "FranchiseJoinRequestCreate":
        has_slug = bool(self.parent_slug and str(self.parent_slug).strip())
        has_id = self.parent_tenant_id is not None
        if has_slug == has_id:
            raise ValueError("Provide exactly one of parent_slug or parent_tenant_id")
        return self


class FranchiseJoinRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    child_tenant_id: UUID
    parent_tenant_id: UUID
    status: str
    message: str | None
    preferred_billing_mode: str | None
    requested_by_user_id: UUID
    decided_by_user_id: UUID | None
    decided_at: datetime | None
    rejection_reason: str | None
    created_at: datetime
    updated_at: datetime


class FranchiseJoinRequestListResponse(BaseModel):
    items: list[FranchiseJoinRequestResponse]
    total: int


class FranchiseJoinDecision(BaseModel):
    """Parent org admin approves (creates hierarchy link) or rejects."""

    approve: bool
    billing_mode: str | None = Field(
        None, description="Required when approve=true: central or independent"
    )
    seat_allocations: dict[str, int] | None = None
    governance_mode: str | None = Field(
        None,
        description="Required when approve=true: child_managed | parent_managed | hybrid | isolated",
    )
    governance: dict | None = Field(
        None,
        description="Optional overrides merged onto defaults for the chosen governance_mode",
    )
    rejection_reason: str | None = Field(None, max_length=500)

    @model_validator(mode="after")
    def approve_requires_mode(self) -> "FranchiseJoinDecision":
        if self.approve:
            if self.billing_mode not in ("central", "independent"):
                raise ValueError("billing_mode must be central or independent when approving")
            raw = (self.governance_mode or "").strip().lower()
            if raw not in GOVERNANCE_MODES:
                raise ValueError(
                    "governance_mode is required when approving: child_managed, parent_managed, hybrid, or isolated"
                )
        return self


class ChildOrganizationRollupResponse(BaseModel):
    """Aggregated activity snapshot for a child org (no per-learner PII)."""

    child_tenant_id: UUID
    child_name: str
    active_student_enrollments: int
    active_instructor_memberships: int
    active_classrooms: int
    billing_mode: str | None = Field(None, description="Active link billing mode, if any")
    governance_mode: str | None = Field(None, description="Franchise content/brand policy preset")


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
