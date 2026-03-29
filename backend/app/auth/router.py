from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import CurrentIdentity, bearer_scheme, get_current_identity
from app.core.permissions import require_super_admin
from app.database import get_db

from .schemas import (
    AvailabilityResponse,
    ImpersonateRequest,
    LoginRequest,
    LoginResponse,
    LogoutAllResponse,
    LogoutRequest,
    OnboardRequest,
    OnboardResponse,
    RefreshRequest,
    RegisterRequest,
    StudentLoginRequest,
    TokenResponse,
    UserProfile,
    StudentProfile,
    TenantInfo,
)
from .service import AuthError, AuthService

router = APIRouter()


def _client_ip(request: Request) -> str | None:
    xff = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if xff:
        first = xff.split(",")[0].strip()
        return first[:64] if first else None
    if request.client:
        return (request.client.host or "")[:64] or None
    return None


def get_auth_service(db: AsyncSession = Depends(get_db)) -> AuthService:
    return AuthService(db)


@router.post("/login", response_model=LoginResponse)
async def login(
    data: LoginRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Adult user login with email and password."""
    try:
        return await service.authenticate_user(data)
    except AuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/student-login", response_model=TokenResponse)
async def student_login(
    data: StudentLoginRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Student login - tenant-scoped (username+tenant) or global (email+password)."""
    try:
        return await service.authenticate_student(data)
    except AuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/register", response_model=TokenResponse)
async def register(
    data: RegisterRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Create adult user account and return tokens."""
    try:
        return await service.register_user(data)
    except AuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/check-email", response_model=AvailabilityResponse)
async def check_email(
    email: str,
    service: AuthService = Depends(get_auth_service),
):
    """Check if an email address is available for registration.

    Call on input blur / debounce during Step 1 of the onboarding wizard.
    """
    from pydantic import EmailStr, ValidationError as PydanticValidationError
    try:
        EmailStr._validate(email)
    except (PydanticValidationError, ValueError):
        return AvailabilityResponse(
            value=email, available=False, message="Invalid email format"
        )
    from app.config import settings
    from app.trials.guardrails import normalize_email, trial_email_already_used

    norm = normalize_email(email)
    exists = await service.repo.get_user_by_email(norm)
    if exists:
        return AvailabilityResponse(
            value=email, available=False, message="Email is already registered"
        )
    if settings.TRIAL_ENABLED and await trial_email_already_used(service.db, norm):
        return AvailabilityResponse(
            value=email,
            available=False,
            message="A free trial has already been used with this email address",
        )
    return AvailabilityResponse(value=email, available=True)


@router.get("/check-slug", response_model=AvailabilityResponse)
async def check_slug(
    slug: str,
    service: AuthService = Depends(get_auth_service),
):
    """Check if an organization slug is available.

    Call on input blur / debounce during Step 2 of the onboarding wizard.
    """
    import re
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        return AvailabilityResponse(
            value=slug,
            available=False,
            message="Slug must be lowercase letters, numbers, and hyphens only",
        )
    if len(slug) < 3:
        return AvailabilityResponse(
            value=slug, available=False, message="Slug must be at least 3 characters"
        )
    exists = await service.repo.tenant_slug_exists(slug)
    if exists:
        return AvailabilityResponse(
            value=slug, available=False, message="This URL is already taken"
        )
    return AvailabilityResponse(value=slug, available=True)


@router.post("/onboard", response_model=OnboardResponse, status_code=201)
async def onboard(
    data: OnboardRequest,
    request: Request,
    service: AuthService = Depends(get_auth_service),
):
    """Create a new user account and organization in one step.

    The frontend onboarding wizard collects account info (step 1) and
    organization details (step 2), then calls this endpoint.  The user
    is created, the org is provisioned with default roles, and the user
    is assigned as the owner.  Returns tokens with tenant context so the
    user can start using the app immediately.
    """
    try:
        return await service.onboard(data, client_ip=_client_ip(request))
    except AuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    data: RefreshRequest,
    service: AuthService = Depends(get_auth_service),
):
    """Exchange refresh token for new access and refresh tokens."""
    try:
        return await service.refresh_token(data.refresh_token)
    except AuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.post("/logout")
async def logout(
    body: LogoutRequest,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    identity: CurrentIdentity = Depends(get_current_identity),
    service: AuthService = Depends(get_auth_service),
):
    """Revoke both the access token (from header) and the refresh token (from body)."""
    await service.logout(
        access_token=credentials.credentials,
        refresh_token=body.refresh_token,
    )
    return {"detail": "Logged out successfully"}


@router.post("/logout-all", response_model=LogoutAllResponse)
async def logout_all_devices(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    identity: CurrentIdentity = Depends(get_current_identity),
    service: AuthService = Depends(get_auth_service),
):
    """Revoke all active refresh tokens for the current user across every device."""
    count = await service.logout_all_devices(
        sub_type=identity.sub_type, sub_id=identity.id
    )
    return LogoutAllResponse(revoked_count=count)


@router.get("/me", response_model=UserProfile | StudentProfile)
async def get_me(
    request: Request,
    identity: CurrentIdentity = Depends(get_current_identity),
    service: AuthService = Depends(get_auth_service),
):
    """Get current user or student profile.

    When ``X-Tenant-ID`` is present, resolve role and tenant fields for that
    workspace (must match :class:`TenantMiddleware`). Otherwise fall back to the
    tenant embedded in the access token.
    """
    try:
        tenant_ctx = getattr(request.state, "tenant", None)
        effective_tenant_id = (
            tenant_ctx.tenant_id if tenant_ctx is not None else identity.tenant_id
        )
        return await service.get_profile(
            identity.id, identity.sub_type, tenant_id=effective_tenant_id
        )
    except AuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.get("/student/tenants", response_model=list[TenantInfo])
async def get_student_tenants(
    identity: CurrentIdentity = Depends(get_current_identity),
    service: AuthService = Depends(get_auth_service),
):
    """List tenants the current student is enrolled in. Students only."""
    if identity.sub_type != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can access this endpoint",
        )
    return await service.get_student_tenants(identity.id)


@router.get("/tenants/resolve/{slug_or_code}", response_model=TenantInfo)
async def resolve_tenant(
    slug_or_code: str,
    service: AuthService = Depends(get_auth_service),
):
    """Resolve tenant by slug or code. Public endpoint."""
    tenant = await service.resolve_tenant(slug_or_code)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant not found: {slug_or_code}",
        )
    return tenant


@router.post("/impersonate", response_model=TokenResponse)
async def impersonate(
    data: ImpersonateRequest,
    identity: CurrentIdentity = Depends(get_current_identity),
    _super_admin: None = require_super_admin(),
    service: AuthService = Depends(get_auth_service),
):
    """Super admin only: impersonate a user in a tenant."""
    if identity.sub_type != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only users can impersonate",
        )
    try:
        return await service.impersonate(
            admin_id=identity.id,
            user_id=data.user_id,
            tenant_id=data.tenant_id,
            grant_id=data.grant_id,
        )
    except AuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
