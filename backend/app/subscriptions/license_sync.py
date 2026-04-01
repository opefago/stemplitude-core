"""Build / refresh License + seat rows from a Subscription's Plan (Stripe, trial, etc.)."""

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.licenses.models import License, LicenseFeature, LicenseLimit, SeatUsage
from app.plans.models import Plan
from app.subscriptions.models import Subscription

ACTIVE_SUB_STATUSES = frozenset({"active", "trialing", "past_due"})


def license_status_for_subscription(subscription_status: str) -> str:
    return "active" if subscription_status in ACTIVE_SUB_STATUSES else "inactive"


def seat_limits_from_plan(plan: Plan) -> dict[str, int]:
    limits = {row.limit_key: int(row.limit_value) for row in plan.limits}
    seat_limits: dict[str, int] = {}
    if "max_students" in limits:
        seat_limits["student"] = limits["max_students"]
    if "max_instructors" in limits:
        seat_limits["instructor"] = limits["max_instructors"]
    return seat_limits


async def sync_license_from_subscription(db: AsyncSession, subscription: Subscription) -> None:
    """Upsert license, features, limits, and seat usage from the subscription's plan."""
    plan_result = await db.execute(
        select(Plan)
        .where(Plan.id == subscription.plan_id)
        .options(
            selectinload(Plan.features),
            selectinload(Plan.limits),
        )
    )
    plan = plan_result.scalar_one_or_none()
    if not plan:
        return

    license_result = await db.execute(
        select(License).where(License.subscription_id == subscription.id)
    )
    license_ = license_result.scalar_one_or_none()
    valid_until: date | None = None
    if subscription.current_period_end:
        valid_until = subscription.current_period_end.date()
    elif subscription.trial_end:
        valid_until = subscription.trial_end.date()
    next_status = license_status_for_subscription(subscription.status)

    if not license_:
        license_ = License(
            subscription_id=subscription.id,
            tenant_id=subscription.tenant_id,
            user_id=subscription.user_id,
            status=next_status,
            valid_from=date.today(),
            valid_until=valid_until,
        )
        db.add(license_)
        await db.flush()
    else:
        license_.tenant_id = subscription.tenant_id
        license_.user_id = subscription.user_id
        license_.status = next_status
        # Keep in sync with subscription period / trial (including clearing when Stripe sends nulls).
        license_.valid_until = valid_until

    await db.execute(
        LicenseFeature.__table__.delete().where(LicenseFeature.license_id == license_.id)
    )
    await db.execute(
        LicenseLimit.__table__.delete().where(LicenseLimit.license_id == license_.id)
    )
    await db.execute(
        SeatUsage.__table__.delete().where(SeatUsage.license_id == license_.id)
    )

    for feature in plan.features:
        db.add(
            LicenseFeature(
                license_id=license_.id,
                feature_key=feature.feature_key,
                enabled=bool(feature.enabled),
            )
        )
    for limit in plan.limits:
        db.add(
            LicenseLimit(
                license_id=license_.id,
                limit_key=limit.limit_key,
                limit_value=int(limit.limit_value),
            )
        )
    for seat_type, max_count in seat_limits_from_plan(plan).items():
        db.add(
            SeatUsage(
                license_id=license_.id,
                tenant_id=subscription.tenant_id,
                seat_type=seat_type,
                current_count=0,
                max_count=max_count,
            )
        )
