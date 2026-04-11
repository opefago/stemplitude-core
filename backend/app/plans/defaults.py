"""Plan seeding from the external config/plan_registry.json."""

import json
import logging
from pathlib import Path

from app.plans.models import Plan, PlanFeature, PlanLimit

logger = logging.getLogger(__name__)

_REGISTRY_PATH = Path(__file__).resolve().parents[2] / "config" / "plan_registry.json"

_registry_cache: list[dict] | None = None


def get_default_plans() -> list[dict]:
    """Load plan definitions from plan_registry.json (cached)."""
    global _registry_cache
    if _registry_cache is not None:
        return _registry_cache

    if not _REGISTRY_PATH.exists():
        logger.error("plan_registry.json not found at %s", _REGISTRY_PATH)
        return []

    with open(_REGISTRY_PATH) as f:
        data = json.load(f)

    _registry_cache = data.get("plans", [])
    logger.info(
        "Loaded %d plans from %s",
        len(_registry_cache),
        _REGISTRY_PATH.name,
    )
    return _registry_cache


async def seed_plans(session) -> int:
    """Seed default plans if none exist. Returns count of plans created."""
    from sqlalchemy import select

    result = await session.execute(select(Plan).limit(1))
    if result.scalar_one_or_none():
        return 0

    count = 0
    for defn in get_default_plans():
        plan = Plan(
            name=defn["name"],
            slug=defn["slug"],
            type=defn["type"],
            price_monthly=defn.get("price_monthly"),
            price_yearly=defn.get("price_yearly"),
            stripe_price_id_monthly=defn.get("stripe_price_id_monthly"),
            stripe_price_id_yearly=defn.get("stripe_price_id_yearly"),
            trial_days=defn.get("trial_days", 0),
        )
        session.add(plan)
        await session.flush()

        for f in defn.get("features", []):
            feat = PlanFeature(
                plan_id=plan.id,
                feature_key=f["feature_key"],
                enabled=f.get("enabled", True),
            )
            session.add(feat)
        for lim in defn.get("limits", []):
            limit = PlanLimit(
                plan_id=plan.id,
                limit_key=lim["limit_key"],
                limit_value=lim["limit_value"],
            )
            session.add(limit)
        count += 1

    return count
