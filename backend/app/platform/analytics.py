"""Platform analytics: stats, top tenants, and recent audit events."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.models import AuditEvent
from app.students.models import Student, StudentMembership
from app.tenants.models import Membership, Tenant
from app.users.models import User


def _parse_period(period: str) -> datetime:
    """Parse period string to a cutoff datetime. Default: 30 days ago."""
    now = datetime.now(timezone.utc)
    mapping = {
        "last_24h": timedelta(hours=24),
        "last_7d": timedelta(days=7),
        "last_30d": timedelta(days=30),
        "last_90d": timedelta(days=90),
    }
    delta = mapping.get(period, timedelta(days=30))
    return now - delta


def _serialize_value(val) -> str | int | bool | None:
    """Serialize UUID and datetime as strings for JSON."""
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    if hasattr(val, "hex"):
        return str(val)
    return val


async def get_stats(session: AsyncSession, period: str) -> dict:
    """Return platform-wide statistics based on period.

    Period: "last_24h", "last_7d", "last_30d", "last_90d". Default: 30 days.
    """
    cutoff = _parse_period(period)

    # Total counts
    tenant_total = await session.scalar(select(func.count()).select_from(Tenant))
    tenant_active = await session.scalar(
        select(func.count()).select_from(Tenant).where(Tenant.is_active.is_(True))
    )
    user_total = await session.scalar(select(func.count()).select_from(User))
    user_active = await session.scalar(
        select(func.count()).select_from(User).where(User.is_active.is_(True))
    )
    student_total = await session.scalar(select(func.count()).select_from(Student))

    # New within period
    new_tenants = await session.scalar(
        select(func.count()).select_from(Tenant).where(Tenant.created_at >= cutoff)
    )
    new_users = await session.scalar(
        select(func.count()).select_from(User).where(User.created_at >= cutoff)
    )
    new_students = await session.scalar(
        select(func.count()).select_from(Student).where(Student.created_at >= cutoff)
    )

    return {
        "tenant_count": tenant_total or 0,
        "active_tenant_count": tenant_active or 0,
        "user_count": user_total or 0,
        "active_user_count": user_active or 0,
        "student_count": student_total or 0,
        "new_tenants": new_tenants or 0,
        "new_users": new_users or 0,
        "new_students": new_students or 0,
    }


async def get_top_tenants(session: AsyncSession, limit: int) -> list[dict]:
    """Return top tenants by membership count.

    Joins tenants with memberships and student_memberships.
    """
    member_counts = (
        select(
            Membership.tenant_id,
            func.count(Membership.id).label("member_count"),
        )
        .group_by(Membership.tenant_id)
    ).subquery()

    student_counts = (
        select(
            StudentMembership.tenant_id,
            func.count(StudentMembership.id).label("student_count"),
        )
        .group_by(StudentMembership.tenant_id)
    ).subquery()

    stmt = (
        select(
            Tenant.name,
            Tenant.slug,
            Tenant.is_active,
            Tenant.created_at,
            Tenant.type,
            func.coalesce(member_counts.c.member_count, 0).label("member_count"),
            func.coalesce(student_counts.c.student_count, 0).label("student_count"),
        )
        .outerjoin(member_counts, Tenant.id == member_counts.c.tenant_id)
        .outerjoin(student_counts, Tenant.id == student_counts.c.tenant_id)
        .order_by(
            (func.coalesce(member_counts.c.member_count, 0) + func.coalesce(student_counts.c.student_count, 0)).desc()
        )
        .limit(limit)
    )

    result = await session.execute(stmt)
    rows = result.all()

    return [
        {
            "name": row.name,
            "slug": row.slug,
            "member_count": int(row.member_count),
            "student_count": int(row.student_count),
            "is_active": row.is_active,
            "created_at": _serialize_value(row.created_at),
            "type": row.type,
        }
        for row in rows
    ]


async def get_recent_events(session: AsyncSession, limit: int) -> list[dict]:
    """Return recent audit events from audit_events table."""
    stmt = (
        select(
            AuditEvent.id,
            AuditEvent.table_name,
            AuditEvent.record_id,
            AuditEvent.action,
            AuditEvent.db_user,
            AuditEvent.created_at,
        )
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
    )

    result = await session.execute(stmt)
    rows = result.all()

    return [
        {
            "id": _serialize_value(row.id),
            "table_name": row.table_name,
            "record_id": row.record_id,
            "action": row.action,
            "db_user": row.db_user,
            "created_at": _serialize_value(row.created_at),
        }
        for row in rows
    ]
