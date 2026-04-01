import logging
from dataclasses import dataclass
from uuid import UUID

from app.capabilities.repository import CapabilityEngineRepository
from app.core.redis import get_redis
from app.dependencies import CurrentIdentity, TenantContext

logger = logging.getLogger(__name__)

# Org-level lab toggles in ``tenant_lab_settings`` apply to these license feature keys
# (not only keys ending in ``_lab``, e.g. game/design makers).
_ORG_LAB_TOGGLE_FEATURES = frozenset(
    {
        "access_game_maker",
        "access_design_maker",
        "game_maker",
        "3d_designer",
        "design_maker",
    }
)


def _org_lab_toggle_applies(required_feature: str | None) -> bool:
    if not required_feature:
        return False
    if required_feature in _ORG_LAB_TOGGLE_FEATURES:
        return True
    return required_feature.endswith("_lab")


async def invalidate_capability_cache_for_tenant(tenant_id: UUID) -> None:
    """Drop cached capability results for a tenant (e.g. after lab enable/disable)."""
    redis = await get_redis()
    prefix = f"cap:{tenant_id}:"
    async for key in redis.scan_iter(match=f"{prefix}*"):
        await redis.delete(key)


@dataclass
class CapabilityResult:
    allowed: bool
    reason: str | None = None


def Allow() -> CapabilityResult:
    return CapabilityResult(allowed=True)


def Deny(reason: str) -> CapabilityResult:
    return CapabilityResult(allowed=False, reason=reason)


class CapabilityEngine:
    def __init__(self, repo: CapabilityEngineRepository):
        self.repo = repo

    async def can(
        self,
        identity: CurrentIdentity,
        tenant: TenantContext,
        capability_key: str,
    ) -> CapabilityResult:
        logger.debug("Capability check key=%s tenant=%s identity=%s", capability_key, tenant.tenant_id, identity.id)

        redis = await get_redis()
        cache_key = f"cap:{tenant.tenant_id}:{identity.id}:{capability_key}"
        cached = await redis.get(cache_key)
        if cached is not None:
            logger.debug("Capability cache hit key=%s result=%s", cache_key, "allow" if cached == "1" else "deny")
            if cached == "1":
                return Allow()
            return Deny(cached)

        capability, rules = await self.repo.get_capability_with_rules(capability_key)
        if not capability:
            logger.warning("Unknown capability key=%s", capability_key)
            return Deny(f"Unknown capability: {capability_key}")

        for rule in rules:
            if rule.role_required:
                if rule.role_required not in tenant.permissions and f"{rule.role_required.split(':')[0]}:*" not in tenant.permissions:
                    result = Deny("Insufficient role permissions")
                    logger.debug("Capability denied key=%s reason=%s", capability_key, result.reason)
                    await redis.setex(cache_key, 30, result.reason)
                    return result

            if rule.required_feature:
                license_ = await self._resolve_license(tenant.tenant_id)
                if not license_:
                    result = Deny("No active license")
                    logger.debug("Capability denied key=%s reason=%s", capability_key, result.reason)
                    await redis.setex(cache_key, 30, result.reason)
                    return result

                if not await self.repo.has_license_feature(license_.id, rule.required_feature):
                    result = Deny("Feature not included in your plan")
                    logger.debug("Capability denied key=%s reason=%s", capability_key, result.reason)
                    await redis.setex(cache_key, 30, result.reason)
                    return result

            if rule.seat_type:
                seat_result = await self._check_seat_availability(
                    tenant.tenant_id, rule.seat_type
                )
                if seat_result is not None:
                    logger.debug("Capability denied key=%s reason=%s", capability_key, seat_result.reason)
                    await redis.setex(cache_key, 30, seat_result.reason)
                    return seat_result

            if rule.limit_key:
                license_ = await self._resolve_license(tenant.tenant_id)
                if license_:
                    pass

            if rule.required_feature and _org_lab_toggle_applies(rule.required_feature):
                if await self.repo.is_lab_disabled(tenant.tenant_id, rule.required_feature):
                    result = Deny("This lab has been disabled by your organization")
                    logger.debug("Capability denied key=%s reason=%s", capability_key, result.reason)
                    await redis.setex(cache_key, 30, result.reason)
                    return result

        await redis.setex(cache_key, 30, "1")
        logger.debug("Capability allowed key=%s", capability_key)
        return Allow()

    async def _resolve_license(self, tenant_id: UUID):
        """Resolve the effective license for a tenant, respecting hierarchy.
        - If the tenant has its own active license, use it.
        - If not, check if it's a centrally-billed child and fall back to parent's license.
        - If billing_mode is 'independent', never fall back.
        """
        license_ = await self.repo.get_active_license(tenant_id)
        if license_:
            logger.debug("License resolved tenant=%s from_parent=%s", tenant_id, False)
            return license_

        link = await self.repo.get_hierarchy_link(tenant_id)
        if not link or link.billing_mode == "independent":
            return None

        parent_lic = await self.repo.get_active_license(link.parent_tenant_id)
        if parent_lic:
            logger.debug("License resolved tenant=%s from_parent=%s", tenant_id, True)
        return parent_lic

    async def _check_seat_availability(
        self, tenant_id: UUID, seat_type: str
    ) -> CapabilityResult | None:
        """Check seat availability respecting hierarchy and allocations.
        Returns Deny result if seats are full, None if OK.

        Logic:
        1. Standalone tenant or independent child -> check own SeatUsage
        2. Central child with seat_allocations for this type -> check allocation cap
        3. Central child without allocation -> check parent's total pool
        """
        link = await self.repo.get_hierarchy_link(tenant_id)

        if not link or link.billing_mode == "independent":
            seat = await self.repo.get_seat_usage(tenant_id, seat_type)
            if seat and seat.current_count >= seat.max_count:
                logger.debug("Seat check tenant=%s type=%s result=%s", tenant_id, seat_type, "Seat limit reached for your plan")
                return Deny("Seat limit reached for your plan")
            logger.debug("Seat check tenant=%s type=%s result=%s", tenant_id, seat_type, "ok")
            return None

        current_count = await self._count_seat_type(tenant_id, seat_type)

        if link.seat_allocations and seat_type in link.seat_allocations:
            allocated_max = link.seat_allocations[seat_type]
            if current_count >= allocated_max:
                reason = f"Seat allocation limit reached ({current_count}/{allocated_max})"
                logger.debug("Seat check tenant=%s type=%s result=%s", tenant_id, seat_type, reason)
                return Deny(reason)
            logger.debug("Seat check tenant=%s type=%s result=%s", tenant_id, seat_type, "ok")
            return None

        parent_seat = await self.repo.get_seat_usage(link.parent_tenant_id, seat_type)
        if not parent_seat:
            logger.debug("Seat check tenant=%s type=%s result=%s", tenant_id, seat_type, "ok")
            return None

        child_ids = await self.repo.get_central_child_ids(link.parent_tenant_id)
        total_used = 0
        for cid in child_ids:
            total_used += await self._count_seat_type(cid, seat_type)

        if total_used >= parent_seat.max_count:
            reason = f"Parent pool seat limit reached ({total_used}/{parent_seat.max_count})"
            logger.debug("Seat check tenant=%s type=%s result=%s", tenant_id, seat_type, reason)
            return Deny(reason)
        logger.debug("Seat check tenant=%s type=%s result=%s", tenant_id, seat_type, "ok")
        return None

    async def _count_seat_type(self, tenant_id: UUID, seat_type: str) -> int:
        """Count actual entities for a seat type in a tenant."""
        if seat_type == "student":
            return await self.repo.count_active_students(tenant_id)
        elif seat_type == "instructor":
            return await self.repo.count_instructors(tenant_id)
        else:
            return await self.repo.get_seat_current_count(tenant_id, seat_type)
