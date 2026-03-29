"""Resolve which learner `/students/me/*` and similar APIs act on (self or X-Child-Context)."""

from __future__ import annotations

from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import CurrentIdentity, TenantContext, get_current_identity, get_tenant_context
from app.students.parent_access import ensure_can_view_student_as_guardian

CHILD_CONTEXT_HEADER = "X-Child-Context"


def _parse_child_context_header(request: Request) -> UUID | None:
    raw = (request.headers.get(CHILD_CONTEXT_HEADER) or "").strip()
    if not raw:
        return None
    try:
        return UUID(raw)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid X-Child-Context header",
        ) from None


# Public alias for routers that need optional child context (empty header → None).
parse_optional_child_context_uuid = _parse_child_context_header


async def require_me_student_id(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
) -> UUID:
    """Student JWT → own id; guardian + X-Child-Context → linked child id."""
    if identity.sub_type == "student":
        return identity.id
    if identity.sub_type != "user":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student session required",
        )
    role = (identity.role or "").strip().lower()
    child_id = _parse_child_context_header(request)
    if child_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sign in as a student, or use Child Mode (X-Child-Context) for this learner",
        )
    if role not in ("parent", "homeschool_parent"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Child context is only available for guardian roles",
        )
    await ensure_can_view_student_as_guardian(
        db,
        identity=identity,
        student_id=child_id,
        tenant_id=tenant.tenant_id,
    )
    return child_id


async def optional_me_student_id_for_leaderboard(
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    tenant: TenantContext = Depends(get_tenant_context),
) -> UUID | None:
    """Leaderboard highlight: student self, or guardian + X-Child-Context; else None."""
    if identity.sub_type == "student":
        return identity.id
    if identity.sub_type != "user":
        return None
    child_id = _parse_child_context_header(request)
    if child_id is None:
        return None
    role = (identity.role or "").strip().lower()
    if role not in ("parent", "homeschool_parent"):
        return None
    await ensure_can_view_student_as_guardian(
        db,
        identity=identity,
        student_id=child_id,
        tenant_id=tenant.tenant_id,
    )
    return child_id


async def resolve_progress_read_student_id(
    request: Request,
    db: AsyncSession,
    identity: CurrentIdentity,
    tenant: TenantContext,
    query_student_id: UUID | None,
) -> UUID:
    """Progress GET: student self, optional ?student_id= for staff, or X-Child-Context."""
    if identity.sub_type == "student":
        if query_student_id is not None and query_student_id != identity.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Students can only access their own progress",
            )
        return identity.id
    if query_student_id is not None:
        await ensure_can_view_student_as_guardian(
            db,
            identity=identity,
            student_id=query_student_id,
            tenant_id=tenant.tenant_id,
        )
        return query_student_id
    child_id = _parse_child_context_header(request)
    if child_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="student_id query or X-Child-Context is required",
        )
    await ensure_can_view_student_as_guardian(
        db,
        identity=identity,
        student_id=child_id,
        tenant_id=tenant.tenant_id,
    )
    return child_id
