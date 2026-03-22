"""Admin repository."""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import case, func, literal, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.models import GlobalAsset
from app.students.models import Student, StudentMembership
from app.subscriptions.models import Subscription
from app.tenants.models import Membership, Tenant
from app.users.models import User


class AdminRepository:
    """Repository for admin queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_global_asset_by_id(self, asset_id: UUID) -> GlobalAsset | None:
        """Get global asset by ID."""
        result = await self.session.execute(
            select(GlobalAsset).where(GlobalAsset.id == asset_id)
        )
        return result.scalar_one_or_none()

    async def list_global_assets(
        self,
        *,
        skip: int = 0,
        limit: int = 50,
        asset_type: str | None = None,
        lab_type: str | None = None,
        category: str | None = None,
        is_active: bool | None = None,
    ) -> tuple[list[GlobalAsset], int]:
        """List global assets."""
        filters = [
            (asset_type, lambda v: GlobalAsset.asset_type == v),
            (lab_type, lambda v: GlobalAsset.lab_type == v),
            (category, lambda v: GlobalAsset.category == v),
            (is_active, lambda v: GlobalAsset.is_active == v),
        ]
        clauses = [build(val) for val, build in filters if val is not None]

        total = (
            await self.session.execute(
                select(func.count()).select_from(GlobalAsset).where(*clauses)
            )
        ).scalar() or 0
        assets = list(
            (
                await self.session.execute(
                    select(GlobalAsset)
                    .where(*clauses)
                    .order_by(GlobalAsset.created_at.desc())
                    .offset(skip)
                    .limit(limit)
                )
            ).scalars().all()
        )
        return assets, total

    async def create_global_asset(
        self,
        *,
        uploaded_by_user_id: UUID | None = None,
        uploaded_by_org_id: UUID | None = None,
        asset_type: str,
        name: str,
        blob_key: str,
        blob_url: str | None = None,
        mime_type: str | None = None,
        file_size: int | None = None,
        metadata_: dict | None = None,
        lab_type: str | None = None,
        category: str | None = None,
    ) -> GlobalAsset:
        """Create a global asset record."""
        asset = GlobalAsset(
            uploaded_by_user_id=uploaded_by_user_id,
            uploaded_by_org_id=uploaded_by_org_id,
            asset_type=asset_type,
            name=name,
            blob_key=blob_key,
            blob_url=blob_url,
            mime_type=mime_type,
            file_size=file_size,
            metadata_=metadata_ or {},
            lab_type=lab_type,
            category=category,
        )
        self.session.add(asset)
        await self.session.flush()
        await self.session.refresh(asset)
        return asset

    async def update_global_asset(
        self,
        asset: GlobalAsset,
        *,
        name: str | None = None,
        lab_type: str | None = None,
        category: str | None = None,
        is_active: bool | None = None,
        metadata_: dict | None = None,
    ) -> GlobalAsset:
        """Update global asset."""
        if name is not None:
            asset.name = name
        if lab_type is not None:
            asset.lab_type = lab_type
        if category is not None:
            asset.category = category
        if is_active is not None:
            asset.is_active = is_active
        if metadata_ is not None:
            asset.metadata_ = metadata_
        await self.session.flush()
        await self.session.refresh(asset)
        return asset

    async def delete_global_asset(self, asset: GlobalAsset) -> None:
        """Delete global asset record."""
        await self.session.delete(asset)

    async def list_tenants(
        self, *, skip: int = 0, limit: int = 50, is_active: bool | None = None
    ) -> tuple[list[Tenant], int]:
        """List tenants with pagination."""
        q = select(Tenant)
        count_q = select(func.count()).select_from(Tenant)
        if is_active is not None:
            q = q.where(Tenant.is_active == is_active)
            count_q = count_q.where(Tenant.is_active == is_active)
        total = (await self.session.execute(count_q)).scalar() or 0
        items = list(
            (await self.session.execute(
                q.order_by(Tenant.name).offset(skip).limit(limit)
            )).scalars().all()
        )
        return items, total

    async def get_stats(
        self, *, since: datetime | None = None, until: datetime | None = None
    ) -> dict:
        """Get admin dashboard overview stats within an optional time window."""

        async def _count(model, *extra_where, date_col=None):
            q = select(func.count()).select_from(model)
            for clause in extra_where:
                q = q.where(clause)
            if date_col is not None:
                if since:
                    q = q.where(date_col >= since)
                if until:
                    q = q.where(date_col <= until)
            return await self.session.scalar(q) or 0

        tenant_count = await _count(
            Tenant, date_col=Tenant.created_at
        )
        active_tenant_count = await _count(
            Tenant, Tenant.is_active == True, date_col=Tenant.created_at
        )
        user_count = await _count(
            User, date_col=User.created_at
        )
        student_count = await _count(
            Student, date_col=Student.created_at
        )
        active_sub_count = await _count(
            Subscription,
            Subscription.status.in_(["active", "trialing"]),
            date_col=Subscription.created_at,
        )
        return {
            "tenant_count": tenant_count,
            "active_tenant_count": active_tenant_count,
            "user_count": user_count,
            "student_count": student_count,
            "active_subscription_count": active_sub_count,
        }

    async def get_metric_counts(self, *, inactive_days: int = 30) -> dict:
        """Return lightweight counts for dashboard summary cards."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=inactive_days)

        last_enrollment = (
            select(
                StudentMembership.tenant_id,
                func.max(StudentMembership.enrolled_at).label("last_enrollment"),
            )
            .group_by(StudentMembership.tenant_id)
            .subquery()
        )
        last_sub = (
            select(
                Subscription.tenant_id,
                func.max(Subscription.updated_at).label("last_sub_update"),
            )
            .group_by(Subscription.tenant_id)
            .subquery()
        )
        last_activity = func.greatest(
            last_enrollment.c.last_enrollment, last_sub.c.last_sub_update
        ).label("last_activity_at")

        inactive_count = (
            await self.session.scalar(
                select(func.count())
                .select_from(Tenant)
                .outerjoin(last_enrollment, Tenant.id == last_enrollment.c.tenant_id)
                .outerjoin(last_sub, Tenant.id == last_sub.c.tenant_id)
                .where(
                    Tenant.is_active == True,
                    (last_activity == None) | (last_activity < cutoff),
                )
            )
        ) or 0

        enrollment_sub = (
            select(StudentMembership.tenant_id)
            .group_by(StudentMembership.tenant_id)
            .subquery()
        )
        zero_enrollment_count = (
            await self.session.scalar(
                select(func.count())
                .select_from(Tenant)
                .outerjoin(enrollment_sub, Tenant.id == enrollment_sub.c.tenant_id)
                .where(enrollment_sub.c.tenant_id == None)
            )
        ) or 0

        latest_sub = (
            select(
                Subscription.tenant_id,
                Subscription.status,
                func.row_number().over(
                    partition_by=Subscription.tenant_id,
                    order_by=Subscription.created_at.desc(),
                ).label("rn"),
            )
            .subquery()
        )
        latest = select(latest_sub).where(latest_sub.c.rn == 1).subquery()
        churned_count = (
            await self.session.scalar(
                select(func.count())
                .select_from(Tenant)
                .join(latest, Tenant.id == latest.c.tenant_id)
                .where(latest.c.status.in_(["canceled", "expired"]))
            )
        ) or 0

        return {
            "inactive_tenant_count": inactive_count,
            "zero_enrollment_count": zero_enrollment_count,
            "churned_tenant_count": churned_count,
        }

    # ---- Growth metrics ----

    async def get_growth_timeseries(
        self, *, since: datetime, until: datetime, granularity: str = "month"
    ) -> dict:
        """Count new tenants, users, and student enrollments per period."""
        trunc = "month" if granularity == "month" else "week"

        async def _series(model, date_col):
            q = (
                select(
                    func.to_char(func.date_trunc(trunc, date_col), "YYYY-MM").label("period"),
                    func.count().label("count"),
                )
                .where(date_col >= since, date_col <= until)
                .group_by(text("1"))
                .order_by(text("1"))
            )
            rows = (await self.session.execute(q)).all()
            return [{"period": r.period, "count": r.count} for r in rows]

        return {
            "tenants_created": await _series(Tenant, Tenant.created_at),
            "users_created": await _series(User, User.created_at),
            "students_enrolled": await _series(StudentMembership, StudentMembership.enrolled_at),
        }

    # ---- Inactive tenants ----

    async def get_inactive_tenants(
        self, *, inactive_days: int = 30, sort_order: str = "asc", skip: int = 0, limit: int = 50
    ) -> tuple[list[dict], int]:
        """Find tenants with no enrollment or subscription activity within N days."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=inactive_days)

        last_enrollment = (
            select(
                StudentMembership.tenant_id,
                func.max(StudentMembership.enrolled_at).label("last_enrollment"),
            )
            .group_by(StudentMembership.tenant_id)
            .subquery()
        )
        last_sub = (
            select(
                Subscription.tenant_id,
                func.max(Subscription.updated_at).label("last_sub_update"),
            )
            .group_by(Subscription.tenant_id)
            .subquery()
        )

        last_activity = func.greatest(
            last_enrollment.c.last_enrollment, last_sub.c.last_sub_update
        ).label("last_activity_at")

        q = (
            select(Tenant, last_activity)
            .outerjoin(last_enrollment, Tenant.id == last_enrollment.c.tenant_id)
            .outerjoin(last_sub, Tenant.id == last_sub.c.tenant_id)
            .where(
                Tenant.is_active == True,
                (last_activity == None) | (last_activity < cutoff),
            )
        )

        count_q = (
            select(func.count())
            .select_from(Tenant)
            .outerjoin(last_enrollment, Tenant.id == last_enrollment.c.tenant_id)
            .outerjoin(last_sub, Tenant.id == last_sub.c.tenant_id)
            .where(
                Tenant.is_active == True,
                (last_activity == None) | (last_activity < cutoff),
            )
        )

        total = (await self.session.execute(count_q)).scalar() or 0
        if sort_order == "desc":
            ordering = last_activity.desc().nullslast()
        else:
            ordering = last_activity.asc().nullsfirst()
        rows = (
            await self.session.execute(
                q.order_by(ordering).offset(skip).limit(limit)
            )
        ).all()

        now = datetime.now(timezone.utc)
        items = []
        for tenant, activity_at in rows:
            ref = activity_at or tenant.created_at
            items.append({
                "id": tenant.id,
                "name": tenant.name,
                "slug": tenant.slug,
                "created_at": tenant.created_at,
                "last_activity_at": activity_at,
                "inactive_days": (now - ref).days,
            })
        return items, total

    # ---- Zero enrollment tenants ----

    async def get_zero_enrollment_tenants(
        self, *, skip: int = 0, limit: int = 50
    ) -> tuple[list[dict], int]:
        """Find tenants with zero student enrollments."""
        enrollment_count = (
            select(
                StudentMembership.tenant_id,
                func.count().label("enrollment_count"),
            )
            .group_by(StudentMembership.tenant_id)
            .subquery()
        )
        user_count_sub = (
            select(
                Membership.tenant_id,
                func.count().label("user_count"),
            )
            .group_by(Membership.tenant_id)
            .subquery()
        )

        q = (
            select(
                Tenant,
                func.coalesce(user_count_sub.c.user_count, literal(0)).label("user_count"),
            )
            .outerjoin(enrollment_count, Tenant.id == enrollment_count.c.tenant_id)
            .outerjoin(user_count_sub, Tenant.id == user_count_sub.c.tenant_id)
            .where(enrollment_count.c.enrollment_count == None)
        )

        count_q = (
            select(func.count())
            .select_from(Tenant)
            .outerjoin(enrollment_count, Tenant.id == enrollment_count.c.tenant_id)
            .where(enrollment_count.c.enrollment_count == None)
        )

        total = (await self.session.execute(count_q)).scalar() or 0
        rows = (
            await self.session.execute(
                q.order_by(Tenant.created_at.desc()).offset(skip).limit(limit)
            )
        ).all()

        return [
            {
                "id": t.id,
                "name": t.name,
                "slug": t.slug,
                "created_at": t.created_at,
                "user_count": uc,
            }
            for t, uc in rows
        ], total

    # ---- Churned tenants ----

    async def get_churned_tenants(
        self,
        *,
        churn_type: str | None = None,
        sort_order: str = "desc",
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[dict], int]:
        """Find tenants whose subscription ended and was not renewed.

        churn_type: 'trial' for trial-only churn, 'paid' for post-paid churn, None for both.
        """
        latest_sub = (
            select(
                Subscription.tenant_id,
                Subscription.status,
                Subscription.current_period_end,
                Subscription.trial_end,
                Subscription.canceled_at,
                func.row_number().over(
                    partition_by=Subscription.tenant_id,
                    order_by=Subscription.created_at.desc(),
                ).label("rn"),
            )
            .subquery()
        )
        latest = select(latest_sub).where(latest_sub.c.rn == 1).subquery()

        was_trial = case(
            (latest.c.status.in_(["canceled", "expired"]) & (latest.c.trial_end != None) & (latest.c.current_period_end == latest.c.trial_end), True),
            else_=False,
        ).label("was_trial")

        student_count_sub = (
            select(
                StudentMembership.tenant_id,
                func.count().label("student_count"),
            )
            .where(StudentMembership.is_active == True)
            .group_by(StudentMembership.tenant_id)
            .subquery()
        )

        ended_at = func.coalesce(
            latest.c.canceled_at, latest.c.current_period_end
        ).label("ended_at")

        q = (
            select(
                Tenant,
                latest.c.status.label("subscription_status"),
                ended_at,
                was_trial,
                func.coalesce(student_count_sub.c.student_count, literal(0)).label("student_count"),
            )
            .join(latest, Tenant.id == latest.c.tenant_id)
            .outerjoin(student_count_sub, Tenant.id == student_count_sub.c.tenant_id)
            .where(latest.c.status.in_(["canceled", "expired"]))
        )

        if churn_type == "trial":
            q = q.where(was_trial == True)
        elif churn_type == "paid":
            q = q.where(was_trial == False)

        count_q = (
            select(func.count())
            .select_from(Tenant)
            .join(latest, Tenant.id == latest.c.tenant_id)
            .where(latest.c.status.in_(["canceled", "expired"]))
        )
        if churn_type == "trial":
            count_q = count_q.where(was_trial == True)
        elif churn_type == "paid":
            count_q = count_q.where(was_trial == False)

        total = (await self.session.execute(count_q)).scalar() or 0
        if sort_order == "asc":
            ordering = ended_at.asc().nullslast()
        else:
            ordering = ended_at.desc().nullslast()
        rows = (
            await self.session.execute(
                q.order_by(ordering).offset(skip).limit(limit)
            )
        ).all()

        return [
            {
                "id": t.id,
                "name": t.name,
                "slug": t.slug,
                "subscription_status": sub_status,
                "ended_at": end,
                "was_trial": trial,
                "student_count": sc,
            }
            for t, sub_status, end, trial, sc in rows
        ], total

    # ---- Subscription breakdown ----

    async def get_subscription_breakdown(
        self, *, since: datetime | None = None, until: datetime | None = None
    ) -> list[dict]:
        """Count subscriptions grouped by status within an optional time window."""
        filters = [
            (since, lambda v: Subscription.created_at >= v),
            (until, lambda v: Subscription.created_at <= v),
        ]
        clauses = [build(val) for val, build in filters if val is not None]

        q = (
            select(Subscription.status, func.count().label("count"))
            .where(*clauses)
            .group_by(Subscription.status)
            .order_by(func.count().desc())
        )
        rows = (await self.session.execute(q)).all()
        return [{"status": r.status, "count": r.count} for r in rows]
