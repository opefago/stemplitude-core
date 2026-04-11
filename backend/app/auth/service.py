import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.logging import mask_email, mask_value
from app.core.redis import get_redis
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.tenants.franchise_governance import brand_settings_for_child_ui
from app.tenants.models import SupportAccessGrant, Tenant, TenantHierarchy
from app.users.models import User

from app.students.ui_mode import resolve_ui_mode

from .repository import AuthRepository
from .schemas import (
    LoginRequest,
    LoginResponse,
    LoginUserInfo,
    OnboardRequest,
    OnboardResponse,
    RegisterRequest,
    StudentLoginRequest,
    TokenResponse,
    UserProfile,
    StudentProfile,
    TenantInfo,
)

logger = logging.getLogger(__name__)

BLACKLIST_PREFIX = "auth:blacklist:jti:"


async def merge_franchise_brand_tenant_settings(db: AsyncSession, tenant) -> dict | None:
    """Apply parent/hybrid UI brand from franchise policy to ``tenant.settings`` for resolution."""
    raw = tenant.settings if isinstance(tenant.settings, dict) else {}
    result = await db.execute(
        select(TenantHierarchy).where(
            TenantHierarchy.child_tenant_id == tenant.id,
            TenantHierarchy.is_active == True,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        return raw or None
    gov_mode = getattr(link, "governance_mode", None) or "child_managed"
    parent_result = await db.execute(select(Tenant).where(Tenant.id == link.parent_tenant_id))
    parent = parent_result.scalar_one_or_none()
    parent_settings = parent.settings if parent and isinstance(parent.settings, dict) else None
    return brand_settings_for_child_ui(
        governance_mode=gov_mode,
        child_settings=raw,
        parent_settings=parent_settings,
    )
SESSIONS_PREFIX = "auth:sessions:"


class AuthError(Exception):
    """Auth-related error with optional HTTP status."""

    def __init__(self, message: str, status_code: int = 401):
        self.message = message
        self.status_code = status_code


class AuthService:
    """Authentication and authorization service."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = AuthRepository(db)

    # ------------------------------------------------------------------
    # Session tracking helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _sessions_key(sub_type: str, sub_id: UUID) -> str:
        return f"{SESSIONS_PREFIX}{sub_type}:{sub_id}"

    async def _register_refresh_jti(
        self, sub_type: str, sub_id: UUID, jti: str
    ) -> None:
        """Add a refresh token JTI to the user's active-sessions set."""
        redis = await get_redis()
        key = self._sessions_key(sub_type, sub_id)
        await redis.sadd(key, jti)
        await redis.expire(key, settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400)

    async def _revoke_jti(self, jti: str, ttl: int) -> None:
        """Blacklist a single JTI."""
        redis = await get_redis()
        await redis.set(f"{BLACKLIST_PREFIX}{jti}", "1", ex=ttl)

    async def _is_jti_revoked(self, jti: str) -> bool:
        redis = await get_redis()
        return bool(await redis.get(f"{BLACKLIST_PREFIX}{jti}"))

    async def _remove_session_jti(
        self, sub_type: str, sub_id: UUID, jti: str
    ) -> None:
        """Remove a JTI from the active-sessions set."""
        redis = await get_redis()
        await redis.srem(self._sessions_key(sub_type, sub_id), jti)

    async def _revoke_all_sessions(self, sub_type: str, sub_id: UUID) -> int:
        """Revoke every active refresh JTI for a user/student."""
        redis = await get_redis()
        key = self._sessions_key(sub_type, sub_id)
        jtis = await redis.smembers(key)
        ttl = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 86400
        count = 0
        for jti in jtis:
            jti_str = jti if isinstance(jti, str) else jti.decode()
            await self._revoke_jti(jti_str, ttl)
            count += 1
        await redis.delete(key)
        return count

    # ------------------------------------------------------------------
    # Token creation helper
    # ------------------------------------------------------------------

    async def _issue_tokens(
        self,
        sub: UUID,
        sub_type: str,
        extra_claims: dict | None = None,
        **rt_kwargs,
    ) -> TokenResponse:
        """Create access + refresh tokens and register the refresh JTI."""
        access_token = create_access_token(
            sub=sub, sub_type=sub_type, extra_claims=extra_claims, **rt_kwargs
        )
        refresh_token, jti = create_refresh_token(sub=sub, sub_type=sub_type)
        await self._register_refresh_jti(sub_type, sub, jti)
        return TokenResponse(access_token=access_token, refresh_token=refresh_token)

    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------

    async def authenticate_user(self, data: LoginRequest) -> LoginResponse:
        """Authenticate adult user with email and password."""
        user = await self.repo.get_active_user_by_email(data.email)
        if not user:
            logger.warning("Failed login: unknown email=%s", mask_email(data.email))
            raise AuthError("Invalid email or password")
        if not verify_password(data.password, user.password_hash):
            logger.warning("Failed login: bad password user_id=%s", user.id)
            raise AuthError("Invalid email or password")

        extra = {
            "is_super_admin": user.is_super_admin,
            "email": user.email,
            "first_name": user.first_name or "",
            "last_name": user.last_name or "",
        }
        membership_row = await self.repo.get_first_user_membership(user.id)
        role_slug = "super_admin" if user.is_super_admin else None
        tenant_id_str = None
        tenant_slug_str = None
        if membership_row:
            _membership, role, tenant = membership_row
            role_slug = role.slug
            tenant_id_str = str(tenant.id)
            tenant_slug_str = tenant.slug
            extra["role"] = role.slug
            extra["tenant_id"] = tenant_id_str
            extra["tenant_slug"] = tenant_slug_str
        elif user.is_super_admin:
            extra["role"] = "super_admin"

        global_role_slug, global_role_name, global_perms = await self.repo.get_user_global_permissions(user.id)
        if global_role_slug:
            extra["global_role"] = global_role_slug
            extra["global_permissions"] = global_perms
            if not extra.get("is_super_admin"):
                extra["is_super_admin"] = True

        tokens = await self._issue_tokens(
            sub=user.id,
            sub_type="user",
            extra_claims=extra,
        )
        user_info = LoginUserInfo(
            id=user.id,
            email=user.email,
            first_name=user.first_name or "",
            last_name=user.last_name or "",
            sub_type="user",
            role=role_slug,
            is_super_admin=extra.get("is_super_admin", False),
            tenant_id=tenant_id_str,
            tenant_slug=tenant_slug_str,
        )
        logger.info("User login successful user_id=%s", user.id)
        return LoginResponse(
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
            token_type=tokens.token_type,
            user=user_info,
        )

    async def authenticate_student(self, data: StudentLoginRequest) -> TokenResponse:
        """Authenticate student - tenant-scoped (username+tenant) or global (email)."""
        if data.email:
            return await self._authenticate_student_global(data)
        return await self._authenticate_student_tenant_scoped(data)

    async def _authenticate_student_global(self, data: StudentLoginRequest) -> TokenResponse:
        """Global account: email + password."""
        student = await self.repo.get_active_global_student_by_email(data.email or "")
        if not student:
            logger.warning("Failed student global login: unknown email=%s", mask_email(data.email or ""))
            raise AuthError("Invalid email or password")
        if not verify_password(data.password, student.password_hash):
            logger.warning("Failed student global login: bad password student_id=%s", student.id)
            raise AuthError("Invalid email or password")

        tokens = await self._issue_tokens(
            sub=student.id, sub_type="student", global_account=True
        )
        logger.info("Student global login student_id=%s", student.id)
        return tokens

    async def _authenticate_student_tenant_scoped(
        self, data: StudentLoginRequest
    ) -> TokenResponse:
        """Tenant-scoped: username + password + tenant_slug or tenant_code."""
        masked_username = mask_value(data.username or "")
        tenant = await self.repo.resolve_tenant(data.tenant_slug or data.tenant_code or "")
        if not tenant:
            logger.warning("Failed student tenant login username=%s", masked_username)
            raise AuthError("Tenant not found", status_code=404)

        row = await self.repo.get_tenant_scoped_student(data.username or "", tenant.id)
        if not row:
            logger.warning("Failed student tenant login: unknown username=%s tenant=%s", masked_username, tenant.slug)
            raise AuthError("Invalid username or password")

        student, membership = row
        if not verify_password(data.password, student.password_hash):
            logger.warning("Failed student tenant login: bad password student_id=%s tenant=%s", student.id, tenant.slug)
            raise AuthError("Invalid username or password")

        tokens = await self._issue_tokens(
            sub=student.id,
            sub_type="student",
            tenant_id=tenant.id,
            role=membership.role,
            global_account=student.global_account,
            extra_claims={
                "tenant_slug": tenant.slug,
                "tenant_name": tenant.name,
            },
        )
        logger.info("Student tenant login student_id=%s tenant=%s", student.id, tenant.slug)
        return tokens

    async def register_user(self, data: RegisterRequest) -> TokenResponse:
        """Create adult user and return tokens."""
        existing = await self.repo.get_user_by_email(data.email)
        if existing:
            logger.warning("Registration rejected, email exists email=%s", mask_email(data.email))
            raise AuthError("Email already registered", status_code=400)

        user = User(
            email=data.email,
            password_hash=hash_password(data.password),
            first_name=data.first_name,
            last_name=data.last_name,
        )
        user = await self.repo.create_user(user)
        logger.info("User registered user_id=%s", user.id)

        return await self._issue_tokens(
            sub=user.id,
            sub_type="user",
            extra_claims={"is_super_admin": user.is_super_admin},
        )

    # ------------------------------------------------------------------
    # Onboarding (register + create organization)
    # ------------------------------------------------------------------

    async def onboard(
        self, data: OnboardRequest, *, client_ip: str | None = None
    ) -> OnboardResponse:
        """Create user + organization atomically. The user becomes the owner."""
        import secrets

        from sqlalchemy import select

        from app.plans.repository import PlanRepository
        from app.roles.models import Permission, Role, RolePermission
        from app.subscriptions.license_sync import sync_license_from_subscription
        from app.subscriptions.models import Subscription
        from app.tenants.models import Membership, Tenant
        from app.trials.guardrails import (
            assert_onboard_rate_limits,
            disposable_email_blocked,
            normalize_email,
            record_trial_grant,
            trial_email_already_used,
            validate_onboard_request_shape,
        )

        validate_onboard_request_shape(
            str(data.email), data.first_name, data.last_name
        )
        email_norm = normalize_email(str(data.email))
        trial_plan = None
        trial_plan_slug: str | None = None

        if settings.TRIAL_ENABLED:
            if disposable_email_blocked(email_norm):
                raise AuthError(
                    "Disposable email addresses are not allowed for sign-up.",
                    status_code=400,
                )
            if await trial_email_already_used(self.db, email_norm):
                logger.warning(
                    "Onboard rejected, trial email reused email=%s",
                    mask_email(email_norm),
                )
                raise AuthError(
                    "A free trial has already been used with this email address.",
                    status_code=409,
                )
            plan_repo = PlanRepository(self.db)
            org_t = (data.organization.type or "center").strip().lower()
            if org_t in ("parent", "homeschool"):
                trial_plan_slug = settings.TRIAL_PLAN_SLUG_PARENT
            else:
                trial_plan_slug = settings.TRIAL_PLAN_SLUG_CENTER
            trial_plan = await plan_repo.get_by_slug(trial_plan_slug)
            if not trial_plan or not trial_plan.is_active:
                logger.error(
                    "Trial plan missing or inactive slug=%s",
                    trial_plan_slug,
                )
                raise AuthError(
                    "Sign-up is temporarily unavailable. Please try again later.",
                    status_code=503,
                )
            await assert_onboard_rate_limits(client_ip, email_norm)

        existing = await self.repo.get_user_by_email(email_norm)
        if existing:
            logger.warning("Onboard rejected, email exists email=%s", mask_email(email_norm))
            raise AuthError("Email already registered", status_code=400)

        existing_slug = await self.db.execute(
            select(Tenant).where(Tenant.slug == data.organization.slug)
        )
        if existing_slug.scalar_one_or_none():
            raise AuthError("Organization URL is already taken", status_code=409)

        code = self._generate_org_code(data.organization.slug)

        user = User(
            email=email_norm,
            password_hash=hash_password(data.password),
            first_name=data.first_name,
            last_name=data.last_name,
        )
        user = await self.repo.create_user(user)

        tenant = Tenant(
            name=data.organization.name,
            slug=data.organization.slug,
            code=code,
            type=data.organization.type,
            settings={},
        )
        self.db.add(tenant)
        await self.db.flush()

        for role_slug, role_name in [
            ("owner", "Owner"),
            ("admin", "Administrator"),
            ("instructor", "Instructor"),
            ("student", "Student"),
        ]:
            self.db.add(Role(
                tenant_id=tenant.id,
                name=role_name,
                slug=role_slug,
                is_system=True,
            ))
        await self.db.flush()

        owner_role_result = await self.db.execute(
            select(Role).where(Role.tenant_id == tenant.id, Role.slug == "owner")
        )
        owner_role = owner_role_result.scalar_one()

        all_perms = await self.db.execute(select(Permission))
        for perm in all_perms.scalars().all():
            self.db.add(RolePermission(role_id=owner_role.id, permission_id=perm.id))
        await self.db.flush()

        self.db.add(Membership(
            user_id=user.id,
            tenant_id=tenant.id,
            role_id=owner_role.id,
        ))
        await self.db.flush()

        if settings.TRIAL_ENABLED:
            if not trial_plan or not trial_plan.is_active:
                logger.error(
                    "Trial plan disappeared mid-onboard slug=%s",
                    trial_plan_slug,
                )
                raise AuthError(
                    "Sign-up is temporarily unavailable. Please try again later.",
                    status_code=503,
                )
            days = (
                settings.TRIAL_DURATION_DAYS
                if settings.TRIAL_DURATION_DAYS > 0
                else (trial_plan.trial_days or 14)
            )
            now = datetime.now(timezone.utc)
            trial_end = now + timedelta(days=days)
            trial_sub = Subscription(
                tenant_id=tenant.id,
                user_id=user.id,
                plan_id=trial_plan.id,
                status="trialing",
                provider="trial",
                provider_subscription_id=f"trial:{tenant.id}",
                current_period_start=now,
                current_period_end=trial_end,
                trial_end=trial_end,
            )
            self.db.add(trial_sub)
            await self.db.flush()
            await sync_license_from_subscription(self.db, trial_sub)
            await record_trial_grant(
                self.db,
                email_normalized=email_norm,
                user_id=user.id,
                tenant_id=tenant.id,
                signup_ip=client_ip,
            )

        logger.info(
            "Onboard complete user_id=%s tenant_id=%s slug=%s",
            user.id, tenant.id, tenant.slug,
        )

        tokens = await self._issue_tokens(
            sub=user.id,
            sub_type="user",
            extra_claims={
                "is_super_admin": False,
                "tenant_id": str(tenant.id),
                "role": "owner",
            },
        )

        return OnboardResponse(
            access_token=tokens.access_token,
            refresh_token=tokens.refresh_token,
            tenant_id=tenant.id,
            tenant_slug=tenant.slug,
            tenant_name=tenant.name,
        )

    @staticmethod
    def _generate_org_code(slug: str) -> str:
        """Generate a short alphanumeric org code from the slug."""
        import secrets
        prefix = slug.replace("-", "").upper()[:4]
        suffix = secrets.token_hex(2).upper()
        return f"{prefix}{suffix}"

    # ------------------------------------------------------------------
    # Token refresh
    # ------------------------------------------------------------------

    async def refresh_token(self, refresh_token: str) -> TokenResponse:
        """Validate refresh token and issue new access + refresh tokens."""
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            logger.warning("Token refresh denied: invalid refresh token")
            raise AuthError("Invalid refresh token")

        jti = payload.get("jti")
        sub = payload.get("sub")
        sub_type = payload.get("sub_type", "user")
        if not sub or not jti:
            logger.warning("Token refresh denied: missing sub or jti")
            raise AuthError("Invalid refresh token")

        if await self._is_jti_revoked(jti):
            logger.warning("Token refresh denied: jti revoked sub=%s", sub)
            raise AuthError("Token has been revoked")

        sub_uuid = UUID(sub)
        if sub_type == "user":
            user = await self.repo.get_active_user_by_id(sub_uuid)
            if not user:
                logger.warning("Token refresh denied: user no longer active sub=%s", sub)
                raise AuthError("User no longer active")
            is_super_admin = user.is_super_admin
            user_email = user.email
            user_first_name = user.first_name or ""
            user_last_name = user.last_name or ""
        elif sub_type == "student":
            student = await self.repo.get_active_student_by_id(sub_uuid)
            if not student:
                logger.warning("Token refresh denied: student no longer active sub=%s", sub)
                raise AuthError("Student no longer active")
            is_super_admin = False
        else:
            logger.warning("Token refresh denied: invalid sub_type=%s", sub_type)
            raise AuthError("Invalid token type")

        exp = payload.get("exp", 0)
        old_ttl = max(1, int(exp) - int(datetime.now(timezone.utc).timestamp()))
        await self._revoke_jti(jti, old_ttl)
        await self._remove_session_jti(sub_type, sub_uuid, jti)

        if sub_type == "user":
            extra = {
                "is_super_admin": is_super_admin,
                "email": user_email,
                "first_name": user_first_name,
                "last_name": user_last_name,
            }
            membership_row = await self.repo.get_first_user_membership(sub_uuid)
            if membership_row:
                _m, role_obj, tenant = membership_row
                extra["role"] = role_obj.slug
                extra["tenant_id"] = str(tenant.id)
                extra["tenant_slug"] = tenant.slug
            global_role_slug, _, global_perms = await self.repo.get_user_global_permissions(sub_uuid)
            if global_role_slug:
                extra["global_role"] = global_role_slug
                extra["global_permissions"] = global_perms
                if not is_super_admin:
                    extra["is_super_admin"] = True
        else:
            extra = {}
            membership_row = await self.repo.get_first_student_membership(sub_uuid)
            if membership_row:
                membership, tenant = membership_row
                extra["tenant_id"] = str(tenant.id)
                extra["tenant_slug"] = tenant.slug
                extra["tenant_name"] = tenant.name
                extra["role"] = membership.role
        tokens = await self._issue_tokens(sub=sub_uuid, sub_type=sub_type, extra_claims=extra)
        logger.info("Token refreshed sub=%s sub_type=%s", sub, sub_type)
        return tokens

    # ------------------------------------------------------------------
    # Logout
    # ------------------------------------------------------------------

    async def logout(self, access_token: str, refresh_token: str) -> None:
        """Revoke both the access and refresh tokens by JTI."""
        access_payload = decode_token(access_token)
        if access_payload and access_payload.get("jti"):
            exp = access_payload.get("exp", 0)
            ttl = max(1, int(exp) - int(datetime.now(timezone.utc).timestamp()))
            await self._revoke_jti(access_payload["jti"], ttl)

        refresh_payload = decode_token(refresh_token)
        if refresh_payload and refresh_payload.get("jti"):
            exp = refresh_payload.get("exp", 0)
            ttl = max(1, int(exp) - int(datetime.now(timezone.utc).timestamp()))
            await self._revoke_jti(refresh_payload["jti"], ttl)

            sub = refresh_payload.get("sub")
            sub_type = refresh_payload.get("sub_type", "user")
            if sub:
                await self._remove_session_jti(sub_type, UUID(sub), refresh_payload["jti"])

        logger.info(
            "Logout completed sub=%s",
            (access_payload or refresh_payload or {}).get("sub"),
        )

    async def logout_all_devices(self, sub_type: str, sub_id: UUID) -> int:
        """Revoke all active refresh tokens for a user or student."""
        count = await self._revoke_all_sessions(sub_type, sub_id)
        logger.info("Logout all devices sub_type=%s sub=%s revoked=%d", sub_type, sub_id, count)
        return count

    # ------------------------------------------------------------------
    # Profile & tenant resolution
    # ------------------------------------------------------------------

    async def get_profile(
        self, identity_id: UUID, sub_type: str, tenant_id: UUID | None = None
    ) -> UserProfile | StudentProfile:
        """Get profile for current identity (user or student)."""
        if sub_type == "user":
            user = await self.repo.get_active_user_by_id(identity_id)
            if not user:
                raise AuthError("User not found", status_code=404)

            role_slug = None
            resolved_tenant_id = None
            resolved_tenant_slug = None
            resolved_tenant_name = None

            if tenant_id:
                membership = await self.repo.get_active_membership(user.id, tenant_id)
                if membership and membership.role_id is None:
                    from app.tenants.service import TenantService

                    ts = TenantService(self.db)
                    await ts.ensure_parent_membership_role_if_linked(user.id, tenant_id)
                    membership = await self.repo.get_active_membership(user.id, tenant_id)
                if membership and membership.role_id:
                    from sqlalchemy import select
                    from app.roles.models import Role
                    result = await self.db.execute(
                        select(Role).where(Role.id == membership.role_id)
                    )
                    role_obj = result.scalar_one_or_none()
                    if role_obj:
                        role_slug = role_obj.slug
                tenant = await self.repo.get_tenant_by_id(tenant_id)
                if tenant:
                    resolved_tenant_id = tenant.id
                    resolved_tenant_slug = tenant.slug
                    resolved_tenant_name = tenant.name
            else:
                membership_row = await self.repo.get_first_user_membership(user.id)
                if membership_row:
                    _membership, role_obj, tenant = membership_row
                    role_slug = role_obj.slug
                    resolved_tenant_id = tenant.id
                    resolved_tenant_slug = tenant.slug
                    resolved_tenant_name = tenant.name

            if not role_slug and user.is_super_admin:
                role_slug = "super_admin"

            global_role_slug, global_role_name, global_perms = await self.repo.get_user_global_permissions(identity_id)

            return UserProfile(
                id=user.id,
                email=user.email,
                first_name=user.first_name,
                last_name=user.last_name,
                is_active=user.is_active,
                is_super_admin=user.is_super_admin,
                role=role_slug,
                tenant_id=resolved_tenant_id,
                tenant_slug=resolved_tenant_slug,
                tenant_name=resolved_tenant_name,
                global_role=global_role_slug,
                global_permissions=global_perms,
            )
        elif sub_type == "student":
            student = await self.repo.get_active_student_by_id(identity_id)
            if not student:
                raise AuthError("Student not found", status_code=404)

            resolved_mode = None
            mode_source = None
            resolved_tenant_id = None
            resolved_tenant_slug = None
            resolved_tenant_name = None
            if tenant_id:
                membership = await self.repo.get_student_membership(identity_id, tenant_id)
                tenant = await self.repo.get_tenant_by_id(tenant_id)
                tenant_settings = (
                    await merge_franchise_brand_tenant_settings(self.db, tenant) if tenant else None
                )
                if tenant:
                    resolved_tenant_id = tenant.id
                    resolved_tenant_slug = tenant.slug
                    resolved_tenant_name = tenant.name
                resolved_mode, mode_source = resolve_ui_mode(
                    student_dob=student.date_of_birth,
                    membership_override=membership.ui_mode_override if membership else None,
                    tenant_settings=tenant_settings,
                )
            else:
                membership_row = await self.repo.get_first_student_membership(identity_id)
                if membership_row:
                    membership, tenant = membership_row
                    resolved_tenant_id = tenant.id
                    resolved_tenant_slug = tenant.slug
                    resolved_tenant_name = tenant.name
                    tenant_settings = await merge_franchise_brand_tenant_settings(self.db, tenant)
                    resolved_mode, mode_source = resolve_ui_mode(
                        student_dob=student.date_of_birth,
                        membership_override=membership.ui_mode_override if membership else None,
                        tenant_settings=tenant_settings,
                    )

            return StudentProfile(
                id=student.id,
                first_name=student.first_name,
                last_name=student.last_name,
                email=student.email,
                display_name=student.display_name,
                global_account=student.global_account,
                is_active=student.is_active,
                tenant_id=resolved_tenant_id,
                tenant_slug=resolved_tenant_slug,
                tenant_name=resolved_tenant_name,
                resolved_ui_mode=resolved_mode,
                ui_mode_source=mode_source,
            )
        raise AuthError("Invalid identity type", status_code=400)

    async def get_student_tenants(self, student_id: UUID) -> list[TenantInfo]:
        """List tenants the student is enrolled in."""
        tenants = await self.repo.get_student_tenants(student_id)
        return [TenantInfo.model_validate(t) for t in tenants]

    async def resolve_tenant(self, slug_or_code: str) -> TenantInfo | None:
        """Resolve tenant by slug or code."""
        tenant = await self.repo.resolve_tenant(slug_or_code)
        return TenantInfo.model_validate(tenant) if tenant else None

    # ------------------------------------------------------------------
    # Impersonation
    # ------------------------------------------------------------------

    async def impersonate(
        self,
        admin_id: UUID,
        user_id: UUID | None,
        tenant_id: UUID,
        *,
        grant_id: UUID | None = None,
    ) -> TokenResponse:
        """Issue impersonation tokens from an existing tenant-approved grant."""
        grant = await self.repo.get_active_support_access_grant(
            admin_id,
            tenant_id,
            grant_id=grant_id,
        )
        if not grant:
            logger.warning(
                "Impersonation denied: no active support grant admin=%s tenant=%s grant=%s",
                admin_id,
                tenant_id,
                grant_id,
            )
            raise AuthError(
                "No active tenant-approved support access grant found",
                status_code=403,
            )
        if not grant.role_id:
            raise AuthError(
                "Support access grant is missing a tenant role scope",
                status_code=403,
            )

        logger.info(
            "Impersonation started admin=%s tenant=%s grant=%s target_user=%s",
            admin_id,
            tenant_id,
            grant.id,
            user_id,
        )
        return await self._issue_tokens(
            sub=admin_id,
            sub_type="impersonation",
            extra_claims={
                "grant_id": str(grant.id),
                "impersonated_tenant_id": str(tenant_id),
            },
        )
