"""Guardrails: which students a guardian user may treat as their child for progress/gamification APIs."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import CurrentIdentity
from app.students.repository import StudentRepository


async def ensure_can_view_student_as_guardian(
    db: AsyncSession,
    *,
    identity: CurrentIdentity,
    student_id: UUID,
    tenant_id: UUID,
) -> None:
    """Allow instructors/admins; parent requires ParentStudent link; homeschool_parent link or tenant membership."""
    if identity.sub_type == "student":
        if student_id != identity.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Students can only view their own data",
            )
        return

    repo = StudentRepository(db)
    role = (identity.role or "").strip().lower()

    if role in ("owner", "admin", "instructor"):
        mem = await repo.get_membership(student_id, tenant_id)
        if not mem or not mem.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Student not found in this workspace",
            )
        return

    mem = await repo.get_membership(student_id, tenant_id)
    if not mem or not mem.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found in this workspace",
        )

    if role == "parent":
        if await repo.get_parent_link(identity.id, student_id) is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not linked to this student",
            )
        return

    if role == "homeschool_parent":
        if await repo.get_parent_link(identity.id, student_id) is not None:
            return
        # Mini-tenant operator: any active student in the tenant is theirs to manage/view.
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not allowed to view this student's progress",
    )


async def guardian_may_use_child_context_in_tenant(
    db: AsyncSession,
    *,
    identity: CurrentIdentity,
    student_id: UUID,
    tenant_id: UUID,
) -> bool:
    """True if this principal may use ``X-Child-Context`` for ``student_id`` in ``tenant_id``.

    Used when the guardian has no ``Membership`` row in the child's workspace but a valid
    parent link (or homeschool rules). Tenant middleware then grants shell permissions so
    ``GET /tenants/{id}``, notifications, and classrooms keep working.
    """
    if identity.sub_type != "user":
        return False
    try:
        await ensure_can_view_student_as_guardian(
            db,
            identity=identity,
            student_id=student_id,
            tenant_id=tenant_id,
        )
        return True
    except HTTPException:
        return False
