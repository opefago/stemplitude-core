"""Seed data for initial deployment.

Run with: python -m app.seeds
Seeds: plans, permissions, capabilities, email providers.
All seed data is loaded from JSON files in backend/config/.
"""

import asyncio
import json
import logging
from pathlib import Path

from sqlalchemy import select

from app.database import async_session_factory
from app.plans.models import Plan, PlanFeature, PlanLimit
from app.roles.models import Permission
from app.capabilities.models import Capability, CapabilityRule
from app.email.models import EmailProvider

logger = logging.getLogger(__name__)

CONFIG_DIR = Path(__file__).resolve().parents[1] / "config"


def _load_json(filename: str) -> dict:
    """Load a JSON file from the config directory."""
    path = CONFIG_DIR / filename
    if not path.exists():
        logger.error("%s not found at %s", filename, path)
        return {}
    with open(path) as f:
        return json.load(f)


async def seed_all():
    async with async_session_factory() as db:
        plan_data = _load_json("plan_registry.json")
        perm_data = _load_json("permission_registry.json")
        cap_data = _load_json("capability_registry.json")
        email_data = _load_json("email_provider_registry.json")

        # --- Plans ---
        for plan_def in plan_data.get("plans", []):
            existing = await db.execute(
                select(Plan).where(Plan.slug == plan_def["slug"])
            )
            if existing.scalar_one_or_none():
                continue

            plan = Plan(
                name=plan_def["name"],
                slug=plan_def["slug"],
                type=plan_def["type"],
                price_monthly=plan_def.get("price_monthly"),
                price_yearly=plan_def.get("price_yearly"),
                trial_days=plan_def.get("trial_days", 0),
            )
            db.add(plan)
            await db.flush()

            for f in plan_def.get("features", []):
                db.add(PlanFeature(
                    plan_id=plan.id,
                    feature_key=f["feature_key"],
                    enabled=f.get("enabled", True),
                ))

            for lim in plan_def.get("limits", []):
                db.add(PlanLimit(
                    plan_id=plan.id,
                    limit_key=lim["limit_key"],
                    limit_value=lim["limit_value"],
                ))

        # --- Permissions ---
        for perm_def in perm_data.get("permissions", []):
            resource = perm_def["resource"]
            action = perm_def["action"]
            existing = await db.execute(
                select(Permission).where(
                    Permission.resource == resource, Permission.action == action
                )
            )
            if not existing.scalar_one_or_none():
                db.add(Permission(
                    resource=resource,
                    action=action,
                    description=f"{action.title()} {resource}",
                ))

        # --- Capabilities ---
        for cap_def in cap_data.get("capabilities", []):
            existing = await db.execute(
                select(Capability).where(Capability.key == cap_def["key"])
            )
            if existing.scalar_one_or_none():
                continue

            capability = Capability(
                key=cap_def["key"],
                name=cap_def["name"],
                category=cap_def.get("category"),
                description=cap_def.get("description"),
            )
            db.add(capability)
            await db.flush()

            for rule_def in cap_def.get("rules", []):
                db.add(CapabilityRule(
                    capability_id=capability.id,
                    role_required=rule_def.get("role_required"),
                    required_feature=rule_def.get("required_feature"),
                    seat_type=rule_def.get("seat_type"),
                    limit_key=rule_def.get("limit_key"),
                ))

        # --- Email Providers ---
        for ep_def in email_data.get("providers", []):
            existing = await db.execute(
                select(EmailProvider).where(EmailProvider.provider == ep_def["provider"])
            )
            if not existing.scalar_one_or_none():
                db.add(EmailProvider(
                    provider=ep_def["provider"],
                    is_active=False,
                    priority=ep_def["priority"],
                ))

        await db.commit()
        print("Seed data loaded successfully.")


if __name__ == "__main__":
    print("Hint: prefer  python -m app.manage db seed")
    asyncio.run(seed_all())
