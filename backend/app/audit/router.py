"""Audit log API endpoints (super admin only)."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_super_admin
from app.database import get_db

from .schemas import AuditEventListResponse
from .service import AuditService

router = APIRouter()

AUDITED_TABLES = [
    "tenants", "users", "memberships", "students", "student_memberships",
    "roles", "role_permissions", "subscriptions", "invoices", "licenses",
    "seat_usage", "classrooms", "classroom_students", "programs",
    "tenant_hierarchy", "tenant_lab_settings", "support_access_grants",
    "oauth_connections",
]


@router.get("", response_model=AuditEventListResponse)
async def list_audit_events(
    db: AsyncSession = Depends(get_db),
    table_name: str | None = Query(None, description="Filter by table name.", enum=AUDITED_TABLES),
    record_id: str | None = Query(None, description="Filter by record primary key."),
    action: str | None = Query(None, description="Filter by action type.", enum=["INSERT", "UPDATE", "DELETE", "TRUNCATE"]),
    tenant_id: str | None = Query(None, description="Filter by tenant ID."),
    app_user_id: str | None = Query(None, description="Filter by application user ID."),
    since: datetime | None = Query(None, description="Events created at or after this timestamp."),
    until: datetime | None = Query(None, description="Events created at or before this timestamp."),
    skip: int = Query(0, ge=0, description="Number of records to skip."),
    limit: int = Query(50, ge=1, le=200, description="Maximum number of records to return."),
    _: None = require_super_admin(),
):
    """List audit events with optional filters (super admin only)."""
    service = AuditService(db)
    return await service.list_events(
        table_name=table_name,
        record_id=record_id,
        action=action,
        tenant_id=tenant_id,
        app_user_id=app_user_id,
        since=since,
        until=until,
        skip=skip,
        limit=limit,
    )


@router.get("/{table_name}/{record_id}", response_model=AuditEventListResponse)
async def get_record_history(
    table_name: str,
    record_id: str,
    skip: int = Query(0, ge=0, description="Number of records to skip."),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of records to return."),
    db: AsyncSession = Depends(get_db),
    _: None = require_super_admin(),
):
    """Get paginated audit history for a specific record (super admin only)."""
    service = AuditService(db)
    return await service.get_record_history(
        table_name, record_id, skip=skip, limit=limit
    )
