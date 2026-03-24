"""Platform admin task runner API.

Exposes command execution with automatic Redis-backed history,
plus history CRUD endpoints. No shell execution, no arbitrary code.
"""

from __future__ import annotations

import json
import logging
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import blob_storage
from app.core.permissions import require_global_permission
from app.database import get_db
from app.dependencies import require_identity

from sqlalchemy import select as sa_sel

from app.users.models import User

from . import history as cmd_history
from .models import CommandAuditLog
from .parser import ParseError, parse_command
from .registry import get_command, list_commands, validate_params
from .schemas import (
    CommandRequest,
    CommandResponse,
    HistoryDeleteResponse,
    HistoryListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class TenantBillingModeUpdate(BaseModel):
    billing_mode: Literal["live", "test", "internal"]
    billing_email_enabled: bool | None = None


def _serialize_blob_object(obj: dict) -> dict:
    return {
        "key": obj.get("Key"),
        "size": obj.get("Size"),
        "etag": (obj.get("ETag") or "").strip('"'),
        "storage_class": obj.get("StorageClass"),
        "last_modified": obj.get("LastModified").isoformat() if obj.get("LastModified") else None,
    }


def _serialize_blob_head(key: str, head: dict) -> dict:
    return {
        "key": key,
        "size": head.get("ContentLength"),
        "content_type": head.get("ContentType"),
        "etag": (head.get("ETag") or "").strip('"'),
        "last_modified": head.get("LastModified").isoformat() if head.get("LastModified") else None,
        "storage_class": head.get("StorageClass"),
        "metadata": head.get("Metadata") or {},
    }


@router.post(
    "/execute",
    response_model=CommandResponse,
    dependencies=[require_global_permission("platform.tasks", "execute")],
)
async def execute_command(
    body: CommandRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> CommandResponse:
    """Execute a whitelisted platform command.

    The command string is parsed, validated against the registry,
    and executed as a Python function -- never as a shell command.
    History is automatically persisted to Redis.
    """
    identity = require_identity(request)
    raw = body.command.strip()

    logger.info(
        "Platform command executed by user=%s: %s",
        identity.id, raw,
    )

    # Resolve the actor's email once for audit purposes
    user_row = await db.execute(
        sa_sel(User.email).where(User.id == identity.id)
    )
    user_email = user_row.scalar_one_or_none() or str(identity.id)
    client_ip = request.client.host if request.client else None

    try:
        command_key, raw_params = parse_command(raw)
    except ParseError as e:
        await _write_audit(
            db, identity.id, user_email, raw, "", "", {},
            "failed", str(e), client_ip,
        )
        return CommandResponse(ok=False, command=raw, error=str(e))

    cmd_def = get_command(command_key)
    if cmd_def is None:
        await _write_audit(
            db, identity.id, user_email, raw,
            command_key.split(":")[0] if ":" in command_key else command_key,
            command_key.split(":")[-1] if ":" in command_key else "",
            raw_params, "failed",
            f"Unknown command: '{command_key}'", client_ip,
        )
        return CommandResponse(
            ok=False, command=raw,
            error=f"Unknown command: '{command_key}'. Use /commands to see available commands.",
        )

    if cmd_def.handler is None:
        await _write_audit(
            db, identity.id, user_email, raw,
            cmd_def.domain, cmd_def.action, raw_params,
            "failed", "No handler implemented", client_ip,
        )
        return CommandResponse(
            ok=False, command=raw,
            error=f"Command '{command_key}' has no handler implemented.",
        )

    try:
        validated = validate_params(cmd_def, raw_params)
    except ValueError as e:
        await _write_audit(
            db, identity.id, user_email, raw,
            cmd_def.domain, cmd_def.action, raw_params,
            "failed", str(e), client_ip,
        )
        return CommandResponse(ok=False, command=raw, error=str(e))

    try:
        result = await cmd_def.handler(db, validated)
    except Exception as e:
        logger.exception("Command '%s' failed", command_key)
        error_msg = f"Execution error: {type(e).__name__}: {e}"
        await _write_audit(
            db, identity.id, user_email, raw,
            cmd_def.domain, cmd_def.action, validated,
            "failed", error_msg, client_ip,
        )
        return CommandResponse(ok=False, command=raw, error=error_msg)

    is_ok = result.get("ok", True)
    error = result.pop("error", None) if not is_ok else None
    response = CommandResponse(ok=is_ok, command=raw, result=result, error=error)

    output_text = (
        json.dumps(result, default=str, indent=2) if is_ok
        else (error or "Unknown error")
    )

    summary = result.get("message", error or json.dumps(result, default=str)[:500])
    safe_result = json.loads(json.dumps(result, default=str)) if result else None
    await _write_audit(
        db, identity.id, user_email, raw,
        cmd_def.domain, cmd_def.action, validated,
        "success" if is_ok else "failed", summary, client_ip,
        result_data=safe_result,
    )

    try:
        await cmd_history.push_entry(
            identity.id,
            entry_id=str(uuid4()),
            command=raw,
            status="success" if is_ok else "failed",
            output=output_text,
        )
    except Exception:
        logger.warning("Failed to persist command history", exc_info=True)

    return response


async def _write_audit(
    db: AsyncSession,
    user_id,
    user_email: str,
    command: str,
    domain: str,
    action: str,
    params: dict,
    status: str,
    result_summary: str,
    ip_address: str | None,
    result_data: dict | None = None,
) -> None:
    """Persist an audit record. Never raises — failures are logged."""
    try:
        db.add(CommandAuditLog(
            user_id=user_id,
            user_email=user_email,
            command=command,
            domain=domain,
            action=action,
            params=params or None,
            status=status,
            result_summary=(result_summary or "")[:2000],
            result_data=result_data,
            ip_address=ip_address,
        ))
        await db.flush()
    except Exception:
        logger.warning("Failed to write command audit log", exc_info=True)


@router.get(
    "/commands",
    dependencies=[require_global_permission("platform.tasks", "view")],
)
async def get_available_commands():
    """Return the list of available whitelisted commands and their parameters."""
    return {"commands": list_commands()}


# ─── Audit Log endpoints ────────────────────────────────────────────────────

from sqlalchemy import func as sa_func


@router.get(
    "/audit",
    dependencies=[require_global_permission("platform.tasks", "view")],
)
async def get_audit_log(
    db: AsyncSession = Depends(get_db),
    email: str | None = Query(None, description="Filter by executor email"),
    domain: str | None = Query(None, description="Filter by command domain"),
    action: str | None = Query(None, description="Filter by action"),
    status: str | None = Query(None, description="Filter by status"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """Return the shared command audit log (newest first)."""
    q = sa_sel(CommandAuditLog).order_by(CommandAuditLog.created_at.desc())
    count_q = sa_sel(sa_func.count(CommandAuditLog.id))

    if email:
        q = q.where(CommandAuditLog.user_email == email)
        count_q = count_q.where(CommandAuditLog.user_email == email)
    if domain:
        q = q.where(CommandAuditLog.domain == domain)
        count_q = count_q.where(CommandAuditLog.domain == domain)
    if action:
        q = q.where(CommandAuditLog.action == action)
        count_q = count_q.where(CommandAuditLog.action == action)
    if status:
        q = q.where(CommandAuditLog.status == status)
        count_q = count_q.where(CommandAuditLog.status == status)

    total = (await db.execute(count_q)).scalar() or 0
    rows = (await db.execute(q.offset(offset).limit(limit))).scalars().all()

    items = []
    for r in rows:
        entry = {
            "id": str(r.id),
            "user_email": r.user_email,
            "user_id": str(r.user_id),
            "command": r.command,
            "domain": r.domain,
            "action": r.action,
            "status": r.status,
            "result_summary": r.result_summary,
            "ip_address": r.ip_address,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        if r.result_data and "changes" in r.result_data:
            entry["changes"] = r.result_data["changes"]
        items.append(entry)
    return {"items": items, "total": total}


# ─── History endpoints ──────────────────────────────────────────────────────


@router.get(
    "/history",
    response_model=HistoryListResponse,
    dependencies=[require_global_permission("platform.tasks", "view")],
)
async def get_history(
    request: Request,
    offset: int = Query(0, ge=0, description="Skip entries"),
    limit: int = Query(50, ge=1, le=100, description="Max entries to return"),
):
    """Retrieve the current user's command history (newest first)."""
    identity = require_identity(request)
    items = await cmd_history.get_entries(identity.id, offset=offset, limit=limit)
    return HistoryListResponse(items=items, count=len(items))


@router.delete(
    "/history/{entry_id}",
    response_model=HistoryDeleteResponse,
    dependencies=[require_global_permission("platform.tasks", "view")],
)
async def delete_history_entry(entry_id: str, request: Request):
    """Delete a single history entry."""
    identity = require_identity(request)
    deleted = await cmd_history.delete_entry(identity.id, entry_id)
    return HistoryDeleteResponse(deleted=deleted)


@router.delete(
    "/history",
    dependencies=[require_global_permission("platform.tasks", "view")],
)
async def clear_history(request: Request):
    """Clear all command history for the current user."""
    identity = require_identity(request)
    count = await cmd_history.clear_all(identity.id)
    return {"cleared": count}


# ─── Entity Browser endpoints ───────────────────────────────────────────────

from . import entities as entity_browser  # noqa: E402


@router.get(
    "/entities",
    dependencies=[require_global_permission("platform.entities", "view")],
)
async def list_entity_types(db: AsyncSession = Depends(get_db)):
    """Return all browseable entity types with their filter metadata."""
    types = entity_browser.list_entity_types()
    counts: dict[str, int] = {}
    for t in types:
        counts[t["key"]] = await entity_browser.count_entity(db, t["key"])
    for t in types:
        t["count"] = counts.get(t["key"], 0)
    return {"entities": types}


@router.get(
    "/entities/{entity_key}",
    dependencies=[require_global_permission("platform.entities", "view")],
)
async def query_entity(
    entity_key: str,
    db: AsyncSession = Depends(get_db),
    search: str | None = Query(None, description="Full-text search across text columns"),
    sort: str = Query("id", description="Column to sort by"),
    dir: str = Query("desc", description="Sort direction: asc or desc"),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    request: Request = None,
):
    """Query a specific entity type with filters and pagination.

    Custom filters are passed as query parameters matching the entity's
    filter column names (e.g. ?email=john&is_active=true).
    """
    edef = entity_browser.ENTITY_REGISTRY.get(entity_key)
    if not edef:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=404, detail=f"Unknown entity: {entity_key}")

    filter_cols = {f.column for f in edef.filters}
    filters: dict[str, str] = {}
    for param_name, param_value in request.query_params.items():
        if param_name in filter_cols and param_value:
            filters[param_name] = param_value

    result = await entity_browser.query_entities(
        db, entity_key,
        filters=filters,
        search=search,
        sort_column=sort,
        sort_dir=dir if dir in ("asc", "desc") else "desc",
        offset=offset,
        limit=limit,
    )
    if "error" in result:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@router.get(
    "/entities/{entity_key}/{entity_id}",
    dependencies=[require_global_permission("platform.entities", "view")],
)
async def get_entity_detail(
    entity_key: str,
    entity_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a single entity's full JSON payload."""
    row = await entity_browser.get_entity_detail(db, entity_key, entity_id)
    if row is None:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=404, detail="Entity not found")
    return {"entity_key": entity_key, "entity_id": entity_id, "data": row}


# ─── Blob Finder endpoints ──────────────────────────────────────────────────


@router.get(
    "/blobs/query",
    dependencies=[require_global_permission("platform.blobs", "view")],
)
async def query_blobs(
    key: str = Query("", description="Key or search text"),
    mode: Literal["exact", "contains"] = Query("contains", description="Search mode"),
    folders: bool = Query(True, description="Include folder prefixes"),
    max: int = Query(100, ge=1, le=200, description="Maximum rows"),
    prefix: str = Query("", description="Current folder prefix"),
):
    query_text = key.strip()
    current_prefix = prefix.strip()

    if mode == "exact":
        if not query_text:
            return {"mode": mode, "query": query_text, "prefix": current_prefix, "folders": [], "items": []}
        head = blob_storage.head_file(query_text)
        items = [_serialize_blob_head(query_text, head)] if head else []
        return {
            "mode": mode,
            "query": query_text,
            "prefix": current_prefix,
            "folders": [],
            "items": items,
        }

    # mode == "contains"
    folders_out: list[str] = []
    if folders:
        list_resp = blob_storage.list_objects(
            prefix=current_prefix,
            delimiter="/",
            max_keys=max,
        )
        folders_out = [cp.get("Prefix", "") for cp in list_resp.get("CommonPrefixes", []) if cp.get("Prefix")]

    if query_text:
        found = blob_storage.search_objects_contains(
            query_text,
            prefix=current_prefix,
            max_results=max,
        )
        items = [_serialize_blob_object(obj) for obj in found]
    else:
        list_resp = blob_storage.list_objects(
            prefix=current_prefix,
            delimiter="/" if folders else None,
            max_keys=max,
        )
        items = [_serialize_blob_object(obj) for obj in list_resp.get("Contents", [])]
        if folders and not folders_out:
            folders_out = [cp.get("Prefix", "") for cp in list_resp.get("CommonPrefixes", []) if cp.get("Prefix")]

    return {
        "mode": mode,
        "query": query_text,
        "prefix": current_prefix,
        "folders": folders_out,
        "items": items,
    }


@router.get(
    "/blobs/item",
    dependencies=[require_global_permission("platform.blobs", "view")],
)
async def get_blob_item(
    key: str = Query(..., min_length=1, description="Object key"),
):
    head = blob_storage.head_file(key)
    if head is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blob key not found")
    return {"item": _serialize_blob_head(key, head)}


@router.get(
    "/blobs/item/download",
    dependencies=[require_global_permission("platform.blobs", "view")],
)
async def get_blob_item_download_url(
    key: str = Query(..., min_length=1, description="Object key"),
    expires_in: int = Query(3600, ge=60, le=86400),
):
    head = blob_storage.head_file(key)
    if head is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blob key not found")
    return {
        "key": key,
        "url": blob_storage.generate_presigned_download_url(key, expires_in=expires_in),
        "expires_in": expires_in,
    }


# ─── Role Manager endpoints ─────────────────────────────────────────────────

from . import roles as role_manager  # noqa: E402


@router.get(
    "/roles",
    dependencies=[require_global_permission("platform.users", "view")],
)
async def list_global_roles(db: AsyncSession = Depends(get_db)):
    """List all global roles with permissions and user counts."""
    return {"roles": await role_manager.list_roles_with_details(db)}


@router.get(
    "/roles/users",
    dependencies=[require_global_permission("platform.users", "view")],
)
async def list_role_assignments(db: AsyncSession = Depends(get_db)):
    """List all users with global role assignments."""
    return {"assignments": await role_manager.list_user_assignments(db)}


@router.post(
    "/roles/assign",
    dependencies=[require_global_permission("platform.users", "manage")],
)
async def assign_role(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Assign a global role to a user by email."""
    body = await request.json()
    email = body.get("email", "").strip()
    role_slug = body.get("role_slug", "").strip()
    if not email or not role_slug:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="email and role_slug required")
    result = await role_manager.assign_role_to_user(db, email, role_slug)
    return result


@router.post(
    "/roles/remove",
    dependencies=[require_global_permission("platform.users", "manage")],
)
async def remove_role_assignment(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Remove a user's global role by email."""
    body = await request.json()
    email = body.get("email", "").strip()
    if not email:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="email required")
    result = await role_manager.remove_user_role(db, email)
    return result


# ─── Platform Analytics proxy endpoints ──────────────────────────────────────

from . import analytics as platform_analytics  # noqa: E402


@router.get(
    "/analytics/stats",
    dependencies=[require_global_permission("platform.analytics", "view")],
)
async def get_platform_stats(
    db: AsyncSession = Depends(get_db),
    period: str = Query("last_30d", description="Period shortcut"),
):
    """Platform-wide statistics."""
    return await platform_analytics.get_stats(db, period)


@router.get(
    "/analytics/top-tenants",
    dependencies=[require_global_permission("platform.analytics", "view")],
)
async def get_top_tenants(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(10, ge=1, le=50),
):
    """Top tenants by member count."""
    return {"tenants": await platform_analytics.get_top_tenants(db, limit)}


@router.get(
    "/analytics/recent-events",
    dependencies=[require_global_permission("platform.analytics", "view")],
)
async def get_recent_events(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
):
    """Recent platform events from audit log."""
    return {"events": await platform_analytics.get_recent_events(db, limit)}


# ─── Job Worker endpoints ────────────────────────────────────────────────────

import asyncio

from . import jobs as job_worker  # noqa: E402


@router.get(
    "/jobs/types",
    dependencies=[require_global_permission("platform.jobs", "view")],
)
async def list_job_types():
    """Return all registered job types and their metadata."""
    types = await asyncio.to_thread(job_worker.get_job_types)
    return {"job_types": types}


@router.get(
    "/jobs/stats",
    dependencies=[require_global_permission("platform.jobs", "view")],
)
async def get_job_stats():
    """Celery worker stats and active tasks."""
    stats = await asyncio.to_thread(job_worker.get_job_stats)
    return stats


@router.get(
    "/jobs/results",
    dependencies=[require_global_permission("platform.jobs", "view")],
)
async def get_recent_job_results(
    limit: int = Query(50, ge=1, le=200),
):
    """Recent task results from the Celery result backend."""
    results = await asyncio.to_thread(job_worker.get_recent_results, None, limit)
    return {"results": results}


@router.post(
    "/jobs/{task_id}/retry",
    dependencies=[require_global_permission("platform.jobs", "manage")],
)
async def retry_job(task_id: str):
    """Retry a completed/failed task."""
    result = await asyncio.to_thread(job_worker.retry_task, task_id)
    return result


@router.post(
    "/jobs/{task_id}/cancel",
    dependencies=[require_global_permission("platform.jobs", "manage")],
)
async def cancel_job(task_id: str):
    """Cancel a running task."""
    result = await asyncio.to_thread(job_worker.cancel_task, task_id)
    return result


# ─── Health Check endpoint ───────────────────────────────────────────────────

from app.email.models import EmailProvider

from . import health as health_checker  # noqa: E402


@router.get(
    "/health",
    dependencies=[require_global_permission("platform.health", "view")],
)
async def run_health_checks(db: AsyncSession = Depends(get_db)):
    """Run comprehensive health checks on all platform services."""
    result = await db.execute(
        sa_sel(EmailProvider).where(EmailProvider.is_active.is_(True))
    )
    providers = result.scalars().all()

    email_configs: dict[str, dict] = {}
    for p in providers:
        email_configs[p.provider] = p.config or {}

    report = await health_checker.run_all_checks(email_configs)
    return report


# ─── Impersonation endpoints ─────────────────────────────────────────────────

from app.auth.service import AuthService, AuthError
from app.roles.models import Role
from app.tenants.models import Membership, Tenant


@router.patch(
    "/tenants/{tenant_id}/billing-mode",
    dependencies=[require_global_permission("platform.tenants", "manage")],
)
async def update_tenant_billing_mode(
    tenant_id: UUID,
    body: TenantBillingModeUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a tenant's billing execution mode (live/test/internal)."""
    tenant_row = await db.execute(
        sa_sel(Tenant).where(Tenant.id == tenant_id)
    )
    tenant = tenant_row.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    tenant.billing_mode = body.billing_mode
    if body.billing_email_enabled is not None:
        tenant.billing_email_enabled = body.billing_email_enabled
    await db.flush()
    return {
        "ok": True,
        "tenant_id": str(tenant.id),
        "billing_mode": tenant.billing_mode,
        "billing_email_enabled": tenant.billing_email_enabled,
    }


@router.get(
    "/tenants/search",
    dependencies=[require_global_permission("platform.impersonation", "execute")],
)
async def search_tenants(
    q: str = Query("", description="Search query"),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Search tenants by name or slug for impersonation."""
    stmt = sa_sel(
        Tenant.id, Tenant.name, Tenant.slug, Tenant.type, Tenant.is_active
    ).order_by(Tenant.name).limit(limit)

    if q.strip():
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            Tenant.name.ilike(pattern) | Tenant.slug.ilike(pattern)
        )

    result = await db.execute(stmt)
    return {
        "tenants": [
            {
                "id": str(row.id),
                "name": row.name,
                "slug": row.slug,
                "type": row.type,
                "is_active": row.is_active,
            }
            for row in result.all()
        ]
    }


@router.post(
    "/impersonate",
    dependencies=[require_global_permission("platform.impersonation", "execute")],
)
async def impersonate_tenant(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Impersonate a tenant by slug. Auto-selects the owner/highest-role member."""
    identity = require_identity(request)
    body = await request.json()
    tenant_slug = body.get("tenant_slug", "").strip()
    if not tenant_slug:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="tenant_slug required")

    tenant_result = await db.execute(
        sa_sel(Tenant).where(Tenant.slug == tenant_slug, Tenant.is_active.is_(True))
    )
    tenant = tenant_result.scalar_one_or_none()
    if not tenant:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_slug}' not found")

    owner_result = await db.execute(
        sa_sel(Membership)
        .join(Role, Membership.role_id == Role.id)
        .where(
            Membership.tenant_id == tenant.id,
            Membership.is_active.is_(True),
        )
        .order_by(
            (Role.slug == "owner").desc(),
            (Role.slug == "admin").desc(),
            Membership.created_at.asc(),
        )
        .limit(1)
    )
    target_membership = owner_result.scalar_one_or_none()
    if not target_membership:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=404,
            detail=f"No active members found in tenant '{tenant_slug}'",
        )

    auth_service = AuthService(db)
    try:
        tokens = await auth_service.impersonate(
            admin_id=identity.id,
            user_id=target_membership.user_id,
            tenant_id=tenant.id,
        )
    except AuthError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=e.status_code, detail=e.message)

    return {
        "access_token": tokens.access_token,
        "refresh_token": tokens.refresh_token,
        "tenant": {
            "id": str(tenant.id),
            "name": tenant.name,
            "slug": tenant.slug,
        },
    }
