from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_global_permission
from app.database import get_db
from app.dependencies import require_identity
from app.tenants.models import Tenant
from app.users.models import User

from .policy import RateLimitPolicyService, get_rate_limit_policy_config
from .repository import RateLimitOverrideRepository
from .schemas import (
    EffectiveRateLimitResponse,
    RateLimitLookupTenant,
    RateLimitLookupUser,
    RateLimitOverrideListResponse,
    RateLimitOverrideOut,
    RateLimitOverrideUpsert,
    RateLimitProfileOut,
)

router = APIRouter()


@router.get(
    "/profiles",
    dependencies=[require_global_permission("platform.rate_limits", "view")],
    response_model=list[RateLimitProfileOut],
)
async def list_profiles() -> list[RateLimitProfileOut]:
    config = await get_rate_limit_policy_config()
    return [
        RateLimitProfileOut(
            key=profile.key,
            limit=profile.limit,
            window_seconds=profile.window_seconds,
            description=profile.description,
        )
        for profile in config.profiles.values()
    ]


@router.get(
    "/lookup/users",
    dependencies=[require_global_permission("platform.rate_limits", "view")],
    response_model=list[RateLimitLookupUser],
)
async def lookup_users(
    q: str = Query("", description="Search by id, email, first/last name"),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[RateLimitLookupUser]:
    query = q.strip()
    stmt = select(
        User.id,
        User.email,
        User.first_name,
        User.last_name,
        User.is_active,
    ).order_by(User.first_name.asc(), User.last_name.asc()).limit(limit)
    if query:
        pattern = f"%{query}%"
        stmt = stmt.where(
            or_(
                cast(User.id, String).ilike(pattern),
                User.email.ilike(pattern),
                func.concat(User.first_name, " ", User.last_name).ilike(pattern),
            )
        )
    rows = (await db.execute(stmt)).all()
    return [
        RateLimitLookupUser(
            id=row.id,
            email=row.email,
            full_name=f"{row.first_name} {row.last_name}".strip(),
            is_active=bool(row.is_active),
        )
        for row in rows
    ]


@router.get(
    "/lookup/tenants",
    dependencies=[require_global_permission("platform.rate_limits", "view")],
    response_model=list[RateLimitLookupTenant],
)
async def lookup_tenants(
    q: str = Query("", description="Search by id, name, or slug"),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[RateLimitLookupTenant]:
    query = q.strip()
    stmt = select(
        Tenant.id,
        Tenant.name,
        Tenant.slug,
        Tenant.type,
        Tenant.is_active,
    ).order_by(Tenant.name.asc()).limit(limit)
    if query:
        pattern = f"%{query}%"
        stmt = stmt.where(
            or_(
                cast(Tenant.id, String).ilike(pattern),
                Tenant.name.ilike(pattern),
                Tenant.slug.ilike(pattern),
            )
        )
    rows = (await db.execute(stmt)).all()
    return [
        RateLimitLookupTenant(
            id=row.id,
            name=row.name,
            slug=row.slug,
            type=row.type,
            is_active=bool(row.is_active),
        )
        for row in rows
    ]


@router.get(
    "/overrides",
    dependencies=[require_global_permission("platform.rate_limits", "view")],
    response_model=RateLimitOverrideListResponse,
)
async def list_overrides(
    scope_type: str | None = Query(default=None, pattern="^(tenant|user)$"),
    profile_key: str | None = Query(default=None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> RateLimitOverrideListResponse:
    repo = RateLimitOverrideRepository(db)
    rows, total = await repo.list_overrides(
        scope_type=scope_type, profile_key=profile_key, offset=offset, limit=limit
    )

    user_ids = [row.scope_id for row in rows if row.scope_type == "user"]
    tenant_ids = [row.scope_id for row in rows if row.scope_type == "tenant"]

    user_map: dict[UUID, tuple[str, str]] = {}
    if user_ids:
        user_rows = (
            await db.execute(
                select(
                    User.id,
                    User.email,
                    User.first_name,
                    User.last_name,
                ).where(User.id.in_(user_ids))
            )
        ).all()
        for row in user_rows:
            user_map[row.id] = (
                f"{row.first_name} {row.last_name}".strip() or row.email,
                row.email,
            )

    tenant_map: dict[UUID, tuple[str, str]] = {}
    if tenant_ids:
        tenant_rows = (
            await db.execute(
                select(Tenant.id, Tenant.name, Tenant.slug).where(Tenant.id.in_(tenant_ids))
            )
        ).all()
        for row in tenant_rows:
            tenant_map[row.id] = (row.name, row.slug)

    items = []
    for row in rows:
        label = None
        subtitle = None
        if row.scope_type == "user":
            label, subtitle = user_map.get(row.scope_id, (None, None))
        if row.scope_type == "tenant":
            label, subtitle = tenant_map.get(row.scope_id, (None, None))
        items.append(
            RateLimitOverrideOut(
                id=row.id,
                scope_type=row.scope_type,
                scope_id=row.scope_id,
                scope_label=label,
                scope_subtitle=subtitle,
                mode=row.mode,
                profile_key=row.profile_key,
                custom_limit=row.custom_limit,
                custom_window_seconds=row.custom_window_seconds,
                reason=row.reason,
                updated_by=row.updated_by,
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
        )
    return RateLimitOverrideListResponse(
        items=items,
        total=total,
        offset=offset,
        limit=limit,
    )


@router.put(
    "/overrides",
    dependencies=[require_global_permission("platform.rate_limits", "manage")],
    response_model=RateLimitOverrideOut,
)
async def upsert_override(
    payload: RateLimitOverrideUpsert,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> RateLimitOverrideOut:
    config = await get_rate_limit_policy_config()
    mode = payload.mode
    if mode in {"profile_only", "profile_plus_custom"}:
        if not payload.profile_key:
            raise HTTPException(status_code=422, detail="profile_key required for selected mode")
        if payload.profile_key not in config.profiles:
            raise HTTPException(status_code=422, detail="Unknown profile_key")
    if mode == "custom_only":
        if payload.custom_limit is None or payload.custom_window_seconds is None:
            raise HTTPException(
                status_code=422,
                detail="custom_limit and custom_window_seconds required for custom_only mode",
            )
    if mode == "profile_plus_custom":
        if payload.custom_limit is None and payload.custom_window_seconds is None:
            raise HTTPException(
                status_code=422,
                detail="Provide at least one custom value for profile_plus_custom mode",
            )
    identity = require_identity(request)
    repo = RateLimitOverrideRepository(db)
    row = await repo.upsert_override(
        scope_type=payload.scope_type,
        scope_id=payload.scope_id,
        mode=payload.mode,
        profile_key=payload.profile_key,
        custom_limit=payload.custom_limit,
        custom_window_seconds=payload.custom_window_seconds,
        reason=payload.reason,
        updated_by=identity.id,
    )
    await RateLimitPolicyService().invalidate_override_cache(
        payload.scope_type, payload.scope_id
    )
    return RateLimitOverrideOut(
        id=row.id,
        scope_type=row.scope_type,
        scope_id=row.scope_id,
        mode=row.mode,
        profile_key=row.profile_key,
        custom_limit=row.custom_limit,
        custom_window_seconds=row.custom_window_seconds,
        reason=row.reason,
        updated_by=row.updated_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.delete(
    "/overrides/{scope_type}/{scope_id}",
    dependencies=[require_global_permission("platform.rate_limits", "manage")],
)
async def delete_override(
    scope_type: str,
    scope_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    if scope_type not in {"tenant", "user"}:
        raise HTTPException(status_code=400, detail="scope_type must be tenant or user")
    deleted = await RateLimitOverrideRepository(db).delete_override(scope_type, scope_id)
    if deleted:
        await RateLimitPolicyService().invalidate_override_cache(scope_type, scope_id)
    return {"deleted": deleted}


@router.get(
    "/effective",
    dependencies=[require_global_permission("platform.rate_limits", "view")],
    response_model=EffectiveRateLimitResponse,
)
async def get_effective_policy(
    path: str = Query("/api/v1/auth/me"),
    user_id: UUID | None = Query(default=None),
    tenant_id: UUID | None = Query(default=None),
) -> EffectiveRateLimitResponse:
    resolved = await RateLimitPolicyService().resolve(
        path=path, user_id=user_id, tenant_id=tenant_id
    )
    return EffectiveRateLimitResponse(
        route_path=path,
        route_class=resolved.route_class,
        route_profile_key=resolved.route_profile_key,
        user_profile=RateLimitProfileOut(
            key=resolved.user_profile.key,
            limit=resolved.user_profile.limit,
            window_seconds=resolved.user_profile.window_seconds,
            description=resolved.user_profile.description,
        )
        if user_id
        else None,
        tenant_profile=RateLimitProfileOut(
            key=resolved.tenant_profile.key,
            limit=resolved.tenant_profile.limit,
            window_seconds=resolved.tenant_profile.window_seconds,
            description=resolved.tenant_profile.description,
        )
        if tenant_id
        else None,
        anonymous_profile=RateLimitProfileOut(
            key=resolved.anonymous_profile.key,
            limit=resolved.anonymous_profile.limit,
            window_seconds=resolved.anonymous_profile.window_seconds,
            description=resolved.anonymous_profile.description,
        ),
        failure_mode=resolved.failure_mode,
    )
