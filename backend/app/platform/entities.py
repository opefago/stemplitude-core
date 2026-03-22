"""Generic entity browser — whitelisted models, whitelisted filterable columns.

Security: Only models explicitly registered in ENTITY_REGISTRY can be queried.
Filters are applied via SQLAlchemy column objects, never raw SQL.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import String, func, inspect, select, cast
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.models import AuditEvent
from app.assets.models import Asset
from app.classrooms.models import Classroom, ClassroomSession, ClassroomStudent
from app.curriculum.models import Course, Lab, Lesson, Module
from app.integrations.models import OAuthConnection
from app.labs.models import LabAssignment, Project, SubmissionFeedback
from app.licenses.models import License
from app.messaging.models import Message
from app.notifications.models import Notification
from app.plans.models import Plan
from app.programs.models import Program
from app.progress.models import Attendance, LabProgress, LessonProgress
from app.roles.models import Permission, Role, RolePermission, UserRole
from app.students.models import ParentStudent, Student, StudentMembership
from app.subscriptions.models import Invoice, Subscription
from app.tenants.models import Membership, Tenant, TenantHierarchy, TenantLabSetting
from app.users.models import User

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)


@dataclass
class FilterDef:
    """A filterable column exposed to the frontend."""
    column: str
    label: str
    filter_type: str = "text"
    options: list[str] | None = None


@dataclass
class EntityDef:
    """Registration entry for a browseable entity."""
    key: str
    label: str
    model: Any
    icon: str
    filters: list[FilterDef] = field(default_factory=list)
    display_columns: list[str] = field(default_factory=list)


ENTITY_REGISTRY: dict[str, EntityDef] = {}


def _reg(e: EntityDef) -> None:
    ENTITY_REGISTRY[e.key] = e


# ─── Register entities ───────────────────────────────────────────────────────

_reg(EntityDef(
    key="users", label="Users", model=User, icon="Users",
    display_columns=["id", "email", "first_name", "last_name", "is_active", "is_super_admin", "created_at"],
    filters=[
        FilterDef(column="email", label="Email"),
        FilterDef(column="first_name", label="First Name"),
        FilterDef(column="last_name", label="Last Name"),
        FilterDef(column="is_active", label="Active", filter_type="boolean"),
        FilterDef(column="is_super_admin", label="Super Admin", filter_type="boolean"),
    ],
))

_reg(EntityDef(
    key="tenants", label="Tenants", model=Tenant, icon="Building2",
    display_columns=["id", "name", "slug", "code", "type", "is_active", "created_at"],
    filters=[
        FilterDef(column="name", label="Name"),
        FilterDef(column="slug", label="Slug"),
        FilterDef(column="code", label="Code"),
        FilterDef(column="type", label="Type", filter_type="select", options=["center", "parent"]),
        FilterDef(column="is_active", label="Active", filter_type="boolean"),
    ],
))

_reg(EntityDef(
    key="students", label="Students", model=Student, icon="GraduationCap",
    display_columns=["id", "first_name", "last_name", "email", "display_name", "is_active", "created_at"],
    filters=[
        FilterDef(column="email", label="Email"),
        FilterDef(column="first_name", label="First Name"),
        FilterDef(column="last_name", label="Last Name"),
        FilterDef(column="display_name", label="Display Name"),
        FilterDef(column="is_active", label="Active", filter_type="boolean"),
    ],
))

_reg(EntityDef(
    key="memberships", label="Memberships", model=Membership, icon="UserCheck",
    display_columns=["id", "user_id", "tenant_id", "role_id", "is_active", "created_at"],
    filters=[
        FilterDef(column="user_id", label="User ID", filter_type="uuid"),
        FilterDef(column="tenant_id", label="Tenant ID", filter_type="uuid"),
        FilterDef(column="is_active", label="Active", filter_type="boolean"),
    ],
))

_reg(EntityDef(
    key="roles", label="Roles", model=Role, icon="Shield",
    display_columns=["id", "name", "slug", "tenant_id", "is_system", "is_active", "created_at"],
    filters=[
        FilterDef(column="name", label="Name"),
        FilterDef(column="slug", label="Slug"),
        FilterDef(column="tenant_id", label="Tenant ID", filter_type="uuid"),
        FilterDef(column="is_system", label="System Role", filter_type="boolean"),
        FilterDef(column="is_active", label="Active", filter_type="boolean"),
    ],
))

_reg(EntityDef(
    key="permissions", label="Permissions", model=Permission, icon="Key",
    display_columns=["id", "resource", "action", "description"],
    filters=[
        FilterDef(column="resource", label="Resource"),
        FilterDef(column="action", label="Action"),
    ],
))

_reg(EntityDef(
    key="user_roles", label="User Roles", model=UserRole, icon="UserCog",
    display_columns=["id", "user_id", "role_id", "is_active", "granted_by", "created_at"],
    filters=[
        FilterDef(column="user_id", label="User ID", filter_type="uuid"),
        FilterDef(column="role_id", label="Role ID", filter_type="uuid"),
        FilterDef(column="is_active", label="Active", filter_type="boolean"),
    ],
))

_reg(EntityDef(
    key="classrooms", label="Classrooms", model=Classroom, icon="BookOpen",
    display_columns=["id", "name", "tenant_id", "program_id", "instructor_id", "mode", "is_active", "created_at"],
    filters=[
        FilterDef(column="name", label="Name"),
        FilterDef(column="tenant_id", label="Tenant ID", filter_type="uuid"),
        FilterDef(column="instructor_id", label="Instructor ID", filter_type="uuid"),
        FilterDef(column="mode", label="Mode", filter_type="select", options=["virtual", "hybrid", "in_person"]),
        FilterDef(column="is_active", label="Active", filter_type="boolean"),
    ],
))

_reg(EntityDef(
    key="programs", label="Programs", model=Program, icon="Layout",
    display_columns=["id", "name", "tenant_id", "is_active", "created_at"],
    filters=[
        FilterDef(column="name", label="Name"),
        FilterDef(column="tenant_id", label="Tenant ID", filter_type="uuid"),
        FilterDef(column="is_active", label="Active", filter_type="boolean"),
    ],
))

_reg(EntityDef(
    key="courses", label="Courses", model=Course, icon="FileStack",
    display_columns=["id", "title", "tenant_id", "difficulty", "is_published"],
    filters=[
        FilterDef(column="title", label="Title"),
        FilterDef(column="tenant_id", label="Tenant ID", filter_type="uuid"),
        FilterDef(column="difficulty", label="Difficulty"),
        FilterDef(column="is_published", label="Published", filter_type="boolean"),
    ],
))

_reg(EntityDef(
    key="labs", label="Labs", model=Lab, icon="FlaskConical",
    display_columns=["id", "title", "lesson_id", "lab_type"],
    filters=[
        FilterDef(column="title", label="Title"),
        FilterDef(column="lesson_id", label="Lesson ID", filter_type="uuid"),
        FilterDef(column="lab_type", label="Lab Type"),
    ],
))

_reg(EntityDef(
    key="projects", label="Project Submissions", model=Project, icon="FileCheck",
    display_columns=["id", "title", "student_id", "lab_id", "tenant_id", "status", "submitted_at"],
    filters=[
        FilterDef(column="student_id", label="Student ID", filter_type="uuid"),
        FilterDef(column="lab_id", label="Lab ID", filter_type="uuid"),
        FilterDef(column="tenant_id", label="Tenant ID", filter_type="uuid"),
        FilterDef(column="status", label="Status"),
    ],
))

_reg(EntityDef(
    key="plans", label="Plans", model=Plan, icon="CreditCard",
    display_columns=["id", "name", "slug", "type", "price_monthly", "is_active", "created_at"],
    filters=[
        FilterDef(column="name", label="Name"),
        FilterDef(column="slug", label="Slug"),
        FilterDef(column="type", label="Type"),
        FilterDef(column="is_active", label="Active", filter_type="boolean"),
    ],
))

_reg(EntityDef(
    key="subscriptions", label="Subscriptions", model=Subscription, icon="Repeat",
    display_columns=["id", "tenant_id", "user_id", "plan_id", "status", "created_at"],
    filters=[
        FilterDef(column="tenant_id", label="Tenant ID", filter_type="uuid"),
        FilterDef(column="user_id", label="User ID", filter_type="uuid"),
        FilterDef(column="status", label="Status"),
    ],
))

_reg(EntityDef(
    key="licenses", label="Licenses", model=License, icon="Key",
    display_columns=["id", "tenant_id", "user_id", "status", "valid_from", "valid_until", "created_at"],
    filters=[
        FilterDef(column="tenant_id", label="Tenant ID", filter_type="uuid"),
        FilterDef(column="status", label="Status"),
    ],
))

_reg(EntityDef(
    key="assets", label="Assets", model=Asset, icon="Image",
    display_columns=["id", "name", "asset_type", "lab_type", "tenant_id", "is_global", "is_active", "created_at"],
    filters=[
        FilterDef(column="name", label="Name"),
        FilterDef(column="asset_type", label="Asset Type"),
        FilterDef(column="lab_type", label="Lab Type"),
        FilterDef(column="tenant_id", label="Tenant ID", filter_type="uuid"),
        FilterDef(column="is_global", label="Global", filter_type="boolean"),
        FilterDef(column="is_active", label="Active", filter_type="boolean"),
    ],
))

_reg(EntityDef(
    key="messages", label="Messages", model=Message, icon="Mail",
    display_columns=["id", "sender_id", "recipient_id", "tenant_id", "subject", "is_read", "created_at"],
    filters=[
        FilterDef(column="sender_id", label="Sender ID", filter_type="uuid"),
        FilterDef(column="recipient_id", label="Recipient ID", filter_type="uuid"),
        FilterDef(column="tenant_id", label="Tenant ID", filter_type="uuid"),
        FilterDef(column="is_read", label="Read", filter_type="boolean"),
    ],
))

_reg(EntityDef(
    key="notifications", label="Notifications", model=Notification, icon="Bell",
    display_columns=["id", "user_id", "tenant_id", "type", "title", "is_read", "created_at"],
    filters=[
        FilterDef(column="user_id", label="User ID", filter_type="uuid"),
        FilterDef(column="tenant_id", label="Tenant ID", filter_type="uuid"),
        FilterDef(column="type", label="Type"),
        FilterDef(column="is_read", label="Read", filter_type="boolean"),
    ],
))

_reg(EntityDef(
    key="audit_events", label="Audit Events", model=AuditEvent, icon="ScrollText",
    display_columns=["id", "table_name", "record_id", "action", "app_user_id", "tenant_id", "created_at"],
    filters=[
        FilterDef(column="table_name", label="Table"),
        FilterDef(column="action", label="Action", filter_type="select", options=["INSERT", "UPDATE", "DELETE"]),
        FilterDef(column="app_user_id", label="User ID", filter_type="uuid"),
        FilterDef(column="tenant_id", label="Tenant ID", filter_type="uuid"),
        FilterDef(column="record_id", label="Record ID", filter_type="uuid"),
    ],
))


# ─── Query helpers ───────────────────────────────────────────────────────────


def _serialize_value(v: Any) -> Any:
    """Convert a SQLAlchemy column value to JSON-safe form."""
    if v is None:
        return None
    if isinstance(v, UUID):
        return str(v)
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, (dict, list)):
        return v
    return v


REDACTED_FIELDS = frozenset({
    "password_hash", "hashed_password", "password", "secret",
    "api_secret", "client_secret", "token_hash", "refresh_token_hash",
})

REDACTED_PLACEHOLDER = "••••••••"


def _row_to_dict(row: Any, model: Any) -> dict[str, Any]:
    """Convert a SQLAlchemy model instance to a dict with all columns."""
    mapper = inspect(model)
    result: dict[str, Any] = {}
    for col in mapper.columns:
        if col.key in REDACTED_FIELDS:
            result[col.key] = REDACTED_PLACEHOLDER
            continue
        val = getattr(row, col.key, None)
        result[col.key] = _serialize_value(val)
    return result


def list_entity_types() -> list[dict[str, Any]]:
    """Return metadata for all registered entities."""
    return [
        {
            "key": e.key,
            "label": e.label,
            "icon": e.icon,
            "display_columns": e.display_columns,
            "filters": [
                {
                    "column": f.column,
                    "label": f.label,
                    "type": f.filter_type,
                    "options": f.options,
                }
                for f in e.filters
            ],
        }
        for e in ENTITY_REGISTRY.values()
    ]


async def count_entity(session: AsyncSession, entity_key: str) -> int:
    edef = ENTITY_REGISTRY.get(entity_key)
    if not edef:
        return 0
    result = await session.execute(
        select(func.count()).select_from(edef.model)
    )
    return result.scalar() or 0


async def query_entities(
    session: AsyncSession,
    entity_key: str,
    *,
    filters: dict[str, str] | None = None,
    search: str | None = None,
    sort_column: str = "id",
    sort_dir: str = "desc",
    offset: int = 0,
    limit: int = 25,
) -> dict[str, Any]:
    """Query a whitelisted entity with validated filters."""
    edef = ENTITY_REGISTRY.get(entity_key)
    if not edef:
        return {"error": f"Unknown entity: {entity_key}"}

    model = edef.model
    mapper = inspect(model)
    col_names = {c.key for c in mapper.columns}
    filter_col_names = {f.column for f in edef.filters}

    q = select(model)

    if filters:
        for key, val in filters.items():
            if not val or key not in filter_col_names:
                continue
            fdef = next((f for f in edef.filters if f.column == key), None)
            if fdef is None:
                continue
            col_obj = getattr(model, key, None)
            if col_obj is None:
                continue

            if fdef.filter_type == "boolean":
                bool_val = val.lower() in ("true", "1", "yes")
                q = q.where(col_obj == bool_val)
            elif fdef.filter_type == "uuid":
                if _UUID_RE.match(val):
                    q = q.where(col_obj == UUID(val))
            elif fdef.filter_type == "select":
                if fdef.options and val in fdef.options:
                    q = q.where(col_obj == val)
            else:
                q = q.where(cast(col_obj, String).ilike(f"%{val}%"))

    if search:
        search_term = f"%{search}%"
        text_cols = []
        for c in mapper.columns:
            if c.key in ("id",):
                continue
            col_type = str(c.type)
            if "CHAR" in col_type or "TEXT" in col_type or "String" in col_type:
                text_cols.append(c)
        if text_cols:
            from sqlalchemy import or_
            q = q.where(
                or_(*(c.ilike(search_term) for c in text_cols))
            )

    count_q = select(func.count()).select_from(q.subquery())
    total = (await session.execute(count_q)).scalar() or 0

    sort_col_obj = getattr(model, sort_column, None) if sort_column in col_names else None
    if sort_col_obj is None:
        sort_col_obj = getattr(model, "id", model.id)
    if sort_dir == "asc":
        q = q.order_by(sort_col_obj.asc())
    else:
        q = q.order_by(sort_col_obj.desc())

    q = q.offset(offset).limit(limit)
    result = await session.execute(q)
    rows = result.scalars().all()

    display_cols = edef.display_columns or [c.key for c in mapper.columns]
    items = []
    for row in rows:
        item: dict[str, Any] = {}
        for col_key in display_cols:
            val = getattr(row, col_key, None)
            item[col_key] = _serialize_value(val)
        items.append(item)

    return {
        "items": items,
        "total": total,
        "offset": offset,
        "limit": limit,
    }


async def get_entity_detail(
    session: AsyncSession,
    entity_key: str,
    entity_id: str,
) -> dict[str, Any] | None:
    """Get a single entity's full payload by ID."""
    edef = ENTITY_REGISTRY.get(entity_key)
    if not edef:
        return None

    model = edef.model
    try:
        uid = UUID(entity_id)
    except ValueError:
        return None

    result = await session.execute(
        select(model).where(model.id == uid)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None

    return _row_to_dict(row, model)
