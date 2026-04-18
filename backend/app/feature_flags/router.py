from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import require_identity
from app.tenants.models import Tenant
from app.users.models import User

from .provider import EvaluationContext, InternalFeatureFlagProvider
from .registry import sync_registry_to_db
from .repository import FeatureFlagRepository
from .schemas import (
    FeatureEvaluationPreviewRequest,
    FeatureEvaluationResult,
    FeatureFlagMetricsPoint,
    FeatureFlagMetricsResponse,
    FeatureFlagPatch,
    FeatureFlagRulePatch,
    FeatureFlagRuleCreate,
    FeatureFlagRuleOut,
    FeatureFlagTargetPatch,
    FeatureFlagTargetCreate,
    FeatureFlagTargetOut,
    FeatureFlagUpsert,
    FeatureFlagVariantCreate,
    FeatureFlagVariantOut,
)
from .service import FeatureFlagService

router = APIRouter()


def require_feature_flag_permission(action: str):
    """Allow new feature-flag perms with temporary platform task fallback."""

    async def _check(request: Request) -> None:
        identity = require_identity(request)
        if getattr(identity, "is_super_admin", False):
            return

        perms = set(identity.global_permissions or [])
        required = {
            f"platform.feature_flags:{action}",
            "platform.feature_flags:*",
        }
        if action == "view":
            required.update({"platform.tasks:view", "platform.tasks:*"})
        else:
            required.update(
                {
                    "platform.tasks:execute",
                    "platform.tasks:manage",
                    "platform.tasks:*",
                }
            )
        if perms.intersection(required):
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing global permission: platform.feature_flags:{action}",
        )

    return Depends(_check)


@router.get("/", dependencies=[require_feature_flag_permission("view")])
@router.get("", dependencies=[require_feature_flag_permission("view")], include_in_schema=False)
async def list_feature_flags(
    include_archived: bool = Query(False),
    q: str | None = Query(default=None),
    status: str | None = Query(default=None),
    stage: str | None = Query(default=None),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    repo = FeatureFlagRepository(db)
    flags, total = await repo.list_flags(
        include_archived=include_archived,
        query=q,
        status=status,
        stage=stage,
        offset=offset,
        limit=limit,
    )
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [
            {
                "id": str(flag.id),
                "key": flag.key,
                "owner": flag.owner,
                "status": flag.status,
                "description": flag.description,
                "stage": flag.stage,
                "default_enabled": flag.default_enabled,
                "allow_debug_events": flag.allow_debug_events,
                "fail_mode": flag.fail_mode,
                "archived_at": flag.archived_at.isoformat() if flag.archived_at else None,
                "created_at": flag.created_at.isoformat(),
                "updated_at": flag.updated_at.isoformat(),
            }
            for flag in flags
        ]
    }


@router.get(
    "/lookup/users",
    dependencies=[require_feature_flag_permission("view")],
)
async def lookup_users(
    q: str = Query("", description="Search by id, email, name, or username"),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    query = q.strip()
    stmt = select(
        User.id,
        User.email,
        User.first_name,
        User.last_name,
        User.avatar_url,
        User.is_active,
    ).order_by(User.first_name.asc(), User.last_name.asc()).limit(limit)
    if query:
        pattern = f"%{query}%"
        stmt = stmt.where(
            or_(
                cast(User.id, String).ilike(pattern),
                User.email.ilike(pattern),
                func.concat(User.first_name, " ", User.last_name).ilike(pattern),
                func.split_part(User.email, "@", 1).ilike(pattern),
            )
        )
    rows = (await db.execute(stmt)).all()
    return {
        "items": [
            {
                "id": str(row.id),
                "avatar_url": row.avatar_url,
                "email": row.email,
                "full_name": f"{row.first_name} {row.last_name}".strip(),
                "is_active": bool(row.is_active),
            }
            for row in rows
        ]
    }


@router.get(
    "/lookup/tenants",
    dependencies=[require_feature_flag_permission("view")],
)
async def lookup_tenants(
    q: str = Query("", description="Search by id, name, or slug"),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    query = q.strip()
    stmt = select(
        Tenant.id,
        Tenant.name,
        Tenant.slug,
        Tenant.type,
        Tenant.logo_url,
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
    return {
        "items": [
            {
                "id": str(row.id),
                "avatar_url": row.logo_url,
                "name": row.name,
                "slug": row.slug,
                "type": row.type,
                "is_active": bool(row.is_active),
            }
            for row in rows
        ]
    }


@router.get(
    "/{flag_id}",
    dependencies=[require_feature_flag_permission("view")],
)
async def get_feature_flag(
    flag_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    flag = await FeatureFlagRepository(db).get_flag_by_id(flag_id)
    if not flag:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    return {
        "id": str(flag.id),
        "key": flag.key,
        "owner": flag.owner,
        "status": flag.status,
        "description": flag.description,
        "stage": flag.stage,
        "default_enabled": flag.default_enabled,
        "allow_debug_events": flag.allow_debug_events,
        "fail_mode": flag.fail_mode,
        "archived_at": flag.archived_at.isoformat() if flag.archived_at else None,
        "created_at": flag.created_at.isoformat(),
        "updated_at": flag.updated_at.isoformat(),
    }


@router.post("/", dependencies=[require_feature_flag_permission("manage")])
async def create_feature_flag(
    payload: FeatureFlagUpsert,
    db: AsyncSession = Depends(get_db),
):
    repo = FeatureFlagRepository(db)
    existing = await repo.get_flag_by_key(payload.key)
    if existing:
        raise HTTPException(status_code=409, detail=f"Flag '{payload.key}' already exists")
    flag = await repo.create_flag(**payload.model_dump())
    return {"id": str(flag.id), "key": flag.key}


@router.patch(
    "/{flag_id}",
    dependencies=[require_feature_flag_permission("manage")],
)
async def patch_feature_flag(
    flag_id: UUID,
    payload: FeatureFlagPatch,
    db: AsyncSession = Depends(get_db),
):
    repo = FeatureFlagRepository(db)
    flag = await repo.get_flag_by_id(flag_id)
    if not flag:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(flag, field, value)
    await db.flush()
    provider = InternalFeatureFlagProvider(db)
    await provider.invalidate(flag_key=flag.key)
    return {"ok": True}


@router.get(
    "/{flag_id}/rules",
    dependencies=[require_feature_flag_permission("view")],
    response_model=list[FeatureFlagRuleOut],
)
async def list_rules(flag_id: UUID, db: AsyncSession = Depends(get_db)):
    repo = FeatureFlagRepository(db)
    rules = await repo.list_rules(flag_id)
    return [
        FeatureFlagRuleOut(
            id=row.id,
            flag_id=row.flag_id,
            priority=row.priority,
            enabled=row.enabled,
            rule_type=row.rule_type,
            match_operator=row.match_operator,
            conditions=row.conditions_json,
            rollout_percentage=row.rollout_percentage,
            variant=row.variant,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rules
    ]


@router.post(
    "/{flag_id}/rules",
    dependencies=[require_feature_flag_permission("manage")],
    response_model=FeatureFlagRuleOut,
)
async def create_rule(
    flag_id: UUID,
    payload: FeatureFlagRuleCreate,
    db: AsyncSession = Depends(get_db),
):
    repo = FeatureFlagRepository(db)
    flag = await repo.get_flag_by_id(flag_id)
    if not flag:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    row = await repo.create_rule(
        flag_id=flag_id,
        priority=payload.priority,
        enabled=payload.enabled,
        rule_type=payload.rule_type,
        match_operator=payload.match_operator,
        conditions_json=[condition.model_dump() for condition in payload.conditions],
        rollout_percentage=payload.rollout_percentage,
        variant=payload.variant,
    )
    await InternalFeatureFlagProvider(db).invalidate(flag_key=flag.key)
    return FeatureFlagRuleOut(
        id=row.id,
        flag_id=row.flag_id,
        priority=row.priority,
        enabled=row.enabled,
        rule_type=row.rule_type,
        match_operator=row.match_operator,
        conditions=row.conditions_json,
        rollout_percentage=row.rollout_percentage,
        variant=row.variant,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.delete(
    "/rules/{rule_id}",
    dependencies=[require_feature_flag_permission("manage")],
)
async def delete_rule(rule_id: UUID, db: AsyncSession = Depends(get_db)):
    deleted = await FeatureFlagRepository(db).delete_rule(rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"ok": True}


@router.patch(
    "/rules/{rule_id}",
    dependencies=[require_feature_flag_permission("manage")],
    response_model=FeatureFlagRuleOut,
)
async def patch_rule(
    rule_id: UUID,
    payload: FeatureFlagRulePatch,
    db: AsyncSession = Depends(get_db),
):
    repo = FeatureFlagRepository(db)
    row = await repo.get_rule_by_id(rule_id)
    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")
    updates = payload.model_dump(exclude_none=True)
    if "conditions" in updates:
        updates["conditions_json"] = [condition.model_dump() for condition in payload.conditions or []]
        updates.pop("conditions", None)
    for field, value in updates.items():
        setattr(row, field, value)
    await db.flush()
    flag = await repo.get_flag_by_id(row.flag_id)
    if flag:
        await InternalFeatureFlagProvider(db).invalidate(flag_key=flag.key)
    return FeatureFlagRuleOut(
        id=row.id,
        flag_id=row.flag_id,
        priority=row.priority,
        enabled=row.enabled,
        rule_type=row.rule_type,
        match_operator=row.match_operator,
        conditions=row.conditions_json,
        rollout_percentage=row.rollout_percentage,
        variant=row.variant,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get(
    "/{flag_id}/targets",
    dependencies=[require_feature_flag_permission("view")],
    response_model=list[FeatureFlagTargetOut],
)
async def list_targets(flag_id: UUID, db: AsyncSession = Depends(get_db)):
    rows = await FeatureFlagRepository(db).list_targets(flag_id)
    return [
        FeatureFlagTargetOut(
            id=row.id,
            flag_id=row.flag_id,
            target_type=row.target_type,
            target_key=row.target_key,
            stage=row.stage,
            enabled=row.enabled,
            variant=row.variant,
            metadata=row.metadata_json,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


@router.post(
    "/{flag_id}/targets",
    dependencies=[require_feature_flag_permission("manage")],
    response_model=FeatureFlagTargetOut,
)
async def create_target(
    flag_id: UUID,
    payload: FeatureFlagTargetCreate,
    db: AsyncSession = Depends(get_db),
):
    repo = FeatureFlagRepository(db)
    flag = await repo.get_flag_by_id(flag_id)
    if not flag:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    row = await repo.create_target(
        flag_id=flag_id,
        target_type=payload.target_type,
        target_key=payload.target_key,
        stage=payload.stage,
        enabled=payload.enabled,
        variant=payload.variant,
        metadata_json=payload.metadata,
    )
    await InternalFeatureFlagProvider(db).invalidate(flag_key=flag.key)
    return FeatureFlagTargetOut(
        id=row.id,
        flag_id=row.flag_id,
        target_type=row.target_type,
        target_key=row.target_key,
        stage=row.stage,
        enabled=row.enabled,
        variant=row.variant,
        metadata=row.metadata_json,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.delete(
    "/targets/{target_id}",
    dependencies=[require_feature_flag_permission("manage")],
)
async def delete_target(target_id: UUID, db: AsyncSession = Depends(get_db)):
    deleted = await FeatureFlagRepository(db).delete_target(target_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Target not found")
    return {"ok": True}


@router.patch(
    "/targets/{target_id}",
    dependencies=[require_feature_flag_permission("manage")],
    response_model=FeatureFlagTargetOut,
)
async def patch_target(
    target_id: UUID,
    payload: FeatureFlagTargetPatch,
    db: AsyncSession = Depends(get_db),
):
    repo = FeatureFlagRepository(db)
    row = await repo.get_target_by_id(target_id)
    if not row:
        raise HTTPException(status_code=404, detail="Target not found")
    updates = payload.model_dump(exclude_none=True)
    if "metadata" in updates:
        updates["metadata_json"] = updates.pop("metadata")
    for field, value in updates.items():
        setattr(row, field, value)
    await db.flush()
    flag = await repo.get_flag_by_id(row.flag_id)
    if flag:
        await InternalFeatureFlagProvider(db).invalidate(flag_key=flag.key)
    return FeatureFlagTargetOut(
        id=row.id,
        flag_id=row.flag_id,
        target_type=row.target_type,
        target_key=row.target_key,
        stage=row.stage,
        enabled=row.enabled,
        variant=row.variant,
        metadata=row.metadata_json,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get(
    "/{flag_id}/variants",
    dependencies=[require_feature_flag_permission("view")],
    response_model=list[FeatureFlagVariantOut],
)
async def list_variants(flag_id: UUID, db: AsyncSession = Depends(get_db)):
    rows = await FeatureFlagRepository(db).list_variants(flag_id)
    return [
        FeatureFlagVariantOut(
            id=row.id,
            flag_id=row.flag_id,
            key=row.key,
            weight=row.weight,
            description=row.description,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


@router.put(
    "/{flag_id}/variants",
    dependencies=[require_feature_flag_permission("manage")],
    response_model=list[FeatureFlagVariantOut],
)
async def replace_variants(
    flag_id: UUID,
    payload: list[FeatureFlagVariantCreate],
    db: AsyncSession = Depends(get_db),
):
    repo = FeatureFlagRepository(db)
    rows = await repo.replace_variants(flag_id, [entry.model_dump() for entry in payload])
    return [
        FeatureFlagVariantOut(
            id=row.id,
            flag_id=row.flag_id,
            key=row.key,
            weight=row.weight,
            description=row.description,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


@router.post(
    "/{flag_id}/preview",
    dependencies=[require_feature_flag_permission("view")],
    response_model=FeatureEvaluationResult,
)
async def preview_flag(
    flag_id: UUID,
    payload: FeatureEvaluationPreviewRequest,
    db: AsyncSession = Depends(get_db),
):
    repo = FeatureFlagRepository(db)
    flag = await repo.get_flag_by_id(flag_id)
    if not flag:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    service = FeatureFlagService(db)
    result = await service.evaluate(
        flag.key,
        user_id=payload.user_id,
        tenant_id=payload.tenant_id,
        traits=payload.traits,
        stage=payload.stage,
        record_metrics=False,
    )
    return FeatureEvaluationResult(
        key=result.key,
        enabled=result.enabled,
        variant=result.variant,
        decision_source=result.decision_source,
        cache_hit=result.cache_hit,
        reason=result.reason,
    )


@router.post(
    "/{flag_id}/usage",
    dependencies=[require_feature_flag_permission("view")],
)
async def record_flag_usage(
    flag_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    identity = require_identity(request)
    repo = FeatureFlagRepository(db)
    flag = await repo.get_flag_by_id(flag_id)
    if not flag:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    provider = InternalFeatureFlagProvider(db)
    context = EvaluationContext(
        flag_key=flag.key,
        user_id=identity.id if identity.sub_type != "student" else None,
        tenant_id=identity.tenant_id,
        traits={},
        stage="production" if settings.is_production else "dev",
    )
    await provider.record_usage(context)
    return {"ok": True}


@router.get(
    "/{flag_id}/metrics",
    dependencies=[require_feature_flag_permission("view")],
    response_model=FeatureFlagMetricsResponse,
)
async def get_flag_metrics(
    flag_id: UUID,
    days: int = Query(14, ge=1, le=90),
    dimension_key: str = Query("all"),
    dimension_value: str = Query("all"),
    granularity: str = Query("day"),
    db: AsyncSession = Depends(get_db),
):
    repo = FeatureFlagRepository(db)
    flag = await repo.get_flag_by_id(flag_id)
    if not flag:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    provider = InternalFeatureFlagProvider(db)
    await provider.flush_metric_buffers(flag_key=flag.key)
    end_at = datetime.now(timezone.utc)
    start_at = end_at - timedelta(days=days)
    buckets = await repo.list_metric_buckets(
        flag_id,
        start_at=start_at,
        end_at=end_at,
        dimension_key=dimension_key,
        dimension_value=dimension_value,
        granularity=granularity,
    )
    merged: dict[datetime, FeatureFlagMetricsPoint] = {}
    for row in buckets:
        existing = merged.get(row.bucket_start)
        if existing:
            existing.on_count += row.on_count
            existing.off_count += row.off_count
            existing.usage_count += row.usage_count
            for k, v in (row.variant_counts or {}).items():
                existing.variant_counts[k] = existing.variant_counts.get(k, 0) + int(v)
        else:
            merged[row.bucket_start] = FeatureFlagMetricsPoint(
                bucket_start=row.bucket_start,
                on_count=row.on_count,
                off_count=row.off_count,
                usage_count=row.usage_count,
                variant_counts={k: int(v) for k, v in (row.variant_counts or {}).items()},
            )
    return FeatureFlagMetricsResponse(
        flag_key=flag.key,
        dimension_key=dimension_key,
        dimension_value=dimension_value,
        granularity=granularity,
        points=sorted(merged.values(), key=lambda p: p.bucket_start),
    )


@router.post(
    "/sync-registry",
    dependencies=[require_feature_flag_permission("manage")],
)
async def sync_registry(db: AsyncSession = Depends(get_db)):
    result = await sync_registry_to_db(db)
    return {"ok": True, **result}


@router.post(
    "/flush-metrics",
    dependencies=[require_feature_flag_permission("manage")],
)
async def flush_metrics(
    flag_key: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    provider = InternalFeatureFlagProvider(db)
    flushed = await provider.flush_metric_buffers(flag_key=flag_key)
    return {"ok": True, "flushed": flushed}


@router.get(
    "/evaluate/{flag_key}",
    dependencies=[require_feature_flag_permission("view")],
    response_model=FeatureEvaluationResult,
)
async def evaluate_by_key(
    flag_key: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    identity = require_identity(request)
    service = FeatureFlagService(db)
    result = await service.evaluate(
        flag_key,
        user_id=identity.id if identity.sub_type != "student" else None,
        tenant_id=identity.tenant_id,
        traits={},
        stage="production" if settings.is_production else "dev",
        record_metrics=False,
    )
    return FeatureEvaluationResult(
        key=result.key,
        enabled=result.enabled,
        variant=result.variant,
        decision_source=result.decision_source,
        cache_hit=result.cache_hit,
        reason=result.reason,
    )
