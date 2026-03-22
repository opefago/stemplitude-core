"""Capability seeding from the external capability_registry.json."""

import json
import logging
from pathlib import Path

from app.capabilities.models import Capability, CapabilityRule

logger = logging.getLogger(__name__)

_REGISTRY_PATH = Path(__file__).resolve().parents[2] / "config" / "capability_registry.json"

_registry_cache: list[dict] | None = None


def get_default_capabilities() -> list[dict]:
    """Load capability definitions from capability_registry.json (cached)."""
    global _registry_cache
    if _registry_cache is not None:
        return _registry_cache

    if not _REGISTRY_PATH.exists():
        logger.error("capability_registry.json not found at %s", _REGISTRY_PATH)
        return []

    with open(_REGISTRY_PATH) as f:
        data = json.load(f)

    _registry_cache = data.get("capabilities", [])
    logger.info(
        "Loaded %d capabilities from %s",
        len(_registry_cache),
        _REGISTRY_PATH.name,
    )
    return _registry_cache


async def seed_capabilities(session) -> int:
    """Seed default capabilities if none exist. Returns count of capabilities created."""
    from sqlalchemy import select

    result = await session.execute(select(Capability).limit(1))
    if result.scalar_one_or_none():
        return 0

    count = 0
    for defn in get_default_capabilities():
        cap = Capability(
            key=defn["key"],
            name=defn["name"],
            category=defn.get("category"),
            description=defn.get("description"),
        )
        session.add(cap)
        await session.flush()

        for r in defn.get("rules", []):
            rule = CapabilityRule(
                capability_id=cap.id,
                role_required=r.get("role_required"),
                required_feature=r.get("required_feature"),
                seat_type=r.get("seat_type"),
                limit_key=r.get("limit_key"),
            )
            session.add(rule)
        count += 1

    return count
