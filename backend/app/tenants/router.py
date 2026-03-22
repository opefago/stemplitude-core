"""Tenant router."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_identity, require_identity, CurrentIdentity, TenantContext
from app.core.permissions import require_permission

from .schemas import (
    ChildTenantCreate,
    HierarchyListResponse,
    HierarchyResponse,
    HierarchyUpdate,
    LabSettingResponse,
    LabSettingUpdate,
    LabSettingsListResponse,
    MemberAdd,
    MemberRoleUpdate,
    MemberWithUserResponse,
    SeatMonitorResponse,
    StudentPolicies,
    StudentPoliciesUpdate,
    SupportAccessGrantCreate,
    SupportAccessOptionsResponse,
    SupportAccessGrantResponse,
    SupportAccessListResponse,
    TenantCreate,
    TenantListResponse,
    TenantResponse,
    TenantUpdate,
)
from .service import TenantService

router = APIRouter()


def _get_identity(request: Request) -> CurrentIdentity:
    return require_identity(request)


def _require_tenant_match(tenant_id: UUID, request: Request) -> TenantContext:
    """Require tenant context and verify it matches the path param."""
    ctx = getattr(request.state, "tenant", None)
    if ctx is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required. Provide X-Tenant-ID header.",
        )
    if ctx.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant ID in path does not match X-Tenant-ID header.",
        )
    return ctx


@router.post("/", response_model=TenantResponse)
async def create_tenant(
    data: TenantCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """Create tenant (auto-seeds default roles)."""
    if identity.sub_type != "user":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Users only")
    service = TenantService(db)
    tenant = await service.create_tenant(data, identity.id)
    return TenantResponse.model_validate(tenant)


@router.get("/", response_model=TenantListResponse)
async def list_tenants(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
):
    """List user's tenants."""
    if identity.sub_type != "user":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Users only")
    service = TenantService(db)
    tenants = await service.list_user_tenants(identity.id)
    return TenantListResponse(
        items=[TenantResponse.model_validate(t) for t in tenants],
        total=len(tenants),
    )


@router.get("/{id}", response_model=TenantResponse)
async def get_tenant(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "view"),
):
    """Get tenant details."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    tenant = await service.get_tenant(id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return TenantResponse.model_validate(tenant)


@router.patch("/{id}", response_model=TenantResponse)
async def update_tenant(
    id: UUID,
    data: TenantUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "update"),
):
    """Update tenant."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    tenant = await service.update_tenant(id, data)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return TenantResponse.model_validate(tenant)


@router.get("/{id}/student-policies", response_model=StudentPolicies)
async def get_student_policies(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "view"),
):
    """Get student policies."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    policies = await service.get_student_policies(id)
    if not policies:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return policies


@router.patch("/{id}/student-policies", response_model=StudentPolicies)
async def update_student_policies(
    id: UUID,
    data: StudentPoliciesUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "update"),
):
    """Update student policies."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    policies = await service.update_student_policies(id, data)
    if not policies:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return policies


@router.post("/{id}/members")
async def add_member(
    id: UUID,
    data: MemberAdd,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "update"),
):
    """Add member with role."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    membership = await service.add_member(id, data)
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already a member or tenant not found",
        )
    return {"id": str(membership.id), "user_id": str(membership.user_id), "role_id": str(membership.role_id) if membership.role_id else None}


@router.get("/{id}/members", response_model=list[MemberWithUserResponse])
async def list_members(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "view"),
):
    """List members."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    members = await service.list_members(id)
    return [
        MemberWithUserResponse(
            id=m.id,
            user_id=m.user_id,
            tenant_id=m.tenant_id,
            role_id=m.role_id,
            is_active=m.is_active,
            email=u.email,
            first_name=u.first_name,
            last_name=u.last_name,
            role_slug=r.slug if r else None,
        )
        for m, u, r in members
    ]


@router.patch("/{id}/members/{user_id}")
async def update_member_role(
    id: UUID,
    user_id: UUID,
    data: MemberRoleUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "update"),
):
    """Change member role."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    membership = await service.update_member_role(id, user_id, data)
    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    return {"id": str(membership.id), "role_id": str(membership.role_id) if membership.role_id else None}


@router.delete("/{id}/members/{user_id}")
async def remove_member(
    id: UUID,
    user_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "update"),
):
    """Remove member."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    ok = await service.remove_member(id, user_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    return {"status": "removed"}


@router.get("/{id}/lab-settings", response_model=LabSettingsListResponse)
async def get_lab_settings(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "view"),
):
    """Get lab settings."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    settings = await service.list_lab_settings(id)
    return LabSettingsListResponse(items=[LabSettingResponse.model_validate(s) for s in settings])


@router.patch("/{id}/lab-settings", response_model=LabSettingResponse)
async def update_lab_setting(
    id: UUID,
    data: LabSettingUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "update"),
):
    """Toggle labs."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    setting = await service.update_lab_setting(id, data)
    if not setting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return LabSettingResponse.model_validate(setting)


@router.post("/{id}/support-access", response_model=SupportAccessGrantResponse)
async def grant_support_access(
    id: UUID,
    data: SupportAccessGrantCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "update"),
):
    """Grant support access."""
    _require_tenant_match(id, request)
    identity = _get_identity(request)
    service = TenantService(db)
    try:
        grant = await service.grant_support_access(id, data, identity.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if not grant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
    return SupportAccessGrantResponse.model_validate(grant)


@router.get("/{id}/support-access/options", response_model=SupportAccessOptionsResponse)
async def get_support_access_options(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "update"),
):
    """List support users and tenant role scopes available for support grants."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    options = await service.list_support_access_options(id)
    return SupportAccessOptionsResponse.model_validate(options)


@router.get("/{id}/support-access", response_model=SupportAccessListResponse)
async def list_support_grants(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "view"),
):
    """List support access grants."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    grants = await service.list_support_grants(id)
    return SupportAccessListResponse(items=[SupportAccessGrantResponse.model_validate(g) for g in grants])


@router.get("/{id}/support-access/{grant_id}", response_model=SupportAccessGrantResponse)
async def get_support_grant(
    id: UUID,
    grant_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "view"),
):
    """Get grant details."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    grant = await service.get_support_grant(id, grant_id)
    if not grant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grant not found")
    return SupportAccessGrantResponse.model_validate(grant)


@router.patch("/{id}/support-access/{grant_id}/revoke", response_model=SupportAccessGrantResponse)
async def revoke_support_grant(
    id: UUID,
    grant_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "update"),
):
    """Revoke support access grant."""
    _require_tenant_match(id, request)
    identity = _get_identity(request)
    service = TenantService(db)
    grant = await service.revoke_support_grant(id, grant_id, identity.id)
    if not grant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grant not found or already revoked")
    return SupportAccessGrantResponse.model_validate(grant)


# --- Hierarchy (two-level parent → child) ---


@router.post("/{id}/children", response_model=HierarchyResponse, status_code=status.HTTP_201_CREATED)
async def add_child_tenant(
    id: UUID,
    data: ChildTenantCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "update"),
):
    """Link an existing tenant as a child of this parent tenant."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    try:
        link = await service.add_child_tenant(id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return HierarchyResponse.model_validate(link)


@router.get("/{id}/children", response_model=HierarchyListResponse)
async def list_child_tenants(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "view"),
):
    """List all child tenants of this parent."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    children = await service.list_children(id)
    return HierarchyListResponse(
        items=[HierarchyResponse.model_validate(c) for c in children],
        total=len(children),
    )


@router.get("/{id}/children/{child_id}", response_model=HierarchyResponse)
async def get_child_tenant(
    id: UUID,
    child_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "view"),
):
    """Get hierarchy link details for a specific child."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    link = await service.get_hierarchy_link(id, child_id)
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child tenant link not found")
    return HierarchyResponse.model_validate(link)


@router.patch("/{id}/children/{child_id}", response_model=HierarchyResponse)
async def update_child_tenant(
    id: UUID,
    child_id: UUID,
    data: HierarchyUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "update"),
):
    """Update billing mode or seat allocations for a child tenant."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    link = await service.update_hierarchy(id, child_id, data)
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child tenant link not found")
    return HierarchyResponse.model_validate(link)


@router.delete("/{id}/children/{child_id}")
async def remove_child_tenant(
    id: UUID,
    child_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "update"),
):
    """Remove a child tenant link (does not delete the tenant itself)."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    ok = await service.remove_child(id, child_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child tenant link not found")
    return {"status": "removed"}


@router.get("/{id}/children/seats/monitor", response_model=SeatMonitorResponse)
async def monitor_seats(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("tenants", "view"),
):
    """Seat monitoring dashboard: usage across all children, allocation vs capacity."""
    _require_tenant_match(id, request)
    service = TenantService(db)
    return await service.get_seat_monitor(id)
