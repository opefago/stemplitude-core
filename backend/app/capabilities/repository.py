"""Capability repository."""

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.capabilities.models import Capability, CapabilityRule

# Tenant lab toggle rows may use any of these ``lab_type`` strings per logical lab.
_LAB_TYPES_ELECTRONICS: tuple[str, ...] = (
    "access_electronics_lab",
    "electronics_lab",
    "circuit-maker",
)
_LAB_TYPES_ROBOTICS: tuple[str, ...] = (
    "access_robotics_lab",
    "robotics_lab",
    "micro-maker",
    "robotics-lab",
)
_LAB_TYPES_GAME_MAKER: tuple[str, ...] = ("access_game_maker", "game_maker", "game-maker")
_LAB_TYPES_DESIGN_MAKER: tuple[str, ...] = (
    "access_design_maker",
    "design_maker",
    "design-maker",
    "3d_designer",
)
_LAB_TYPES_PYTHON: tuple[str, ...] = ("python_lab", "python-game", "access_python_lab")

# Maps license/capability ``required_feature`` / plan ``feature_key`` → tenant_lab_settings lab_type aliases.
LAB_FEATURE_TO_TENANT_LAB_TYPES: dict[str, tuple[str, ...]] = {
    "access_electronics_lab": _LAB_TYPES_ELECTRONICS,
    "electronics_lab": _LAB_TYPES_ELECTRONICS,
    "access_robotics_lab": _LAB_TYPES_ROBOTICS,
    "robotics_lab": _LAB_TYPES_ROBOTICS,
    "access_game_maker": _LAB_TYPES_GAME_MAKER,
    "game_maker": _LAB_TYPES_GAME_MAKER,
    "access_design_maker": _LAB_TYPES_DESIGN_MAKER,
    "design_maker": _LAB_TYPES_DESIGN_MAKER,
    "3d_designer": _LAB_TYPES_DESIGN_MAKER,
    "python_lab": _LAB_TYPES_PYTHON,
    "access_python_lab": _LAB_TYPES_PYTHON,
}

# Capability rule ``required_feature`` → ``licenses.license_features.feature_key`` values (plan_registry uses the plan-native names).
LICENSE_FEATURE_KEY_ALIASES: dict[str, tuple[str, ...]] = {
    "access_electronics_lab": ("access_electronics_lab", "electronics_lab"),
    "access_robotics_lab": ("access_robotics_lab", "robotics_lab"),
    "access_game_maker": ("access_game_maker", "game_maker"),
    "access_design_maker": ("access_design_maker", "3d_designer", "design_maker"),
    "python_lab": ("python_lab", "access_python_lab"),
    "access_python_lab": ("access_python_lab", "python_lab"),
}


class CapabilityRepository:
    """Repository for capability CRUD queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_all(self, *, skip: int = 0, limit: int = 100) -> tuple[list[Capability], int]:
        """List all capabilities."""
        count_result = await self.session.execute(select(func.count()).select_from(Capability))
        total = count_result.scalar() or 0

        result = await self.session.execute(
            select(Capability)
            .options(selectinload(Capability.rules))
            .order_by(Capability.key)
            .offset(skip)
            .limit(limit)
        )
        capabilities = list(result.scalars().all())
        return capabilities, total

    async def get_by_id(self, capability_id: UUID) -> Capability | None:
        """Get capability by ID."""
        result = await self.session.execute(
            select(Capability)
            .where(Capability.id == capability_id)
            .options(selectinload(Capability.rules))
        )
        return result.scalar_one_or_none()

    async def get_by_key(self, key: str) -> Capability | None:
        """Get capability by key."""
        result = await self.session.execute(
            select(Capability)
            .where(Capability.key == key)
            .options(selectinload(Capability.rules))
        )
        return result.scalar_one_or_none()


class CapabilityEngineRepository:
    """Read-only queries used by the CapabilityEngine for authorization decisions."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_capability_with_rules(self, key: str) -> tuple[Capability | None, list[CapabilityRule]]:
        """Fetch a capability and its rules by key."""
        result = await self.session.execute(
            select(Capability).where(Capability.key == key)
        )
        capability = result.scalar_one_or_none()
        if not capability:
            return None, []

        rules_result = await self.session.execute(
            select(CapabilityRule).where(CapabilityRule.capability_id == capability.id)
        )
        return capability, list(rules_result.scalars().all())

    async def get_active_license(self, tenant_id: UUID):
        """Get the active license for a tenant (direct, not via hierarchy)."""
        from app.licenses.models import License

        result = await self.session.execute(
            select(License).where(
                License.tenant_id == tenant_id,
                License.status == "active",
            )
        )
        return result.scalar_one_or_none()

    async def get_hierarchy_link(self, child_tenant_id: UUID):
        """Get the active hierarchy link for a child tenant."""
        from app.tenants.models import TenantHierarchy

        result = await self.session.execute(
            select(TenantHierarchy).where(
                TenantHierarchy.child_tenant_id == child_tenant_id,
                TenantHierarchy.is_active == True,
            )
        )
        return result.scalar_one_or_none()

    async def has_license_feature(self, license_id: UUID, feature_key: str) -> bool:
        """Whether the license grants a capability ``required_feature`` (resolves plan vs access_* key names)."""
        keys = LICENSE_FEATURE_KEY_ALIASES.get(feature_key, (feature_key,))
        for key in keys:
            if await self._has_license_feature_key(license_id, key):
                return True
        return False

    async def _has_license_feature_key(self, license_id: UUID, feature_key: str) -> bool:
        from app.licenses.models import LicenseFeature

        result = await self.session.execute(
            select(LicenseFeature).where(
                LicenseFeature.license_id == license_id,
                LicenseFeature.feature_key == feature_key,
                LicenseFeature.enabled == True,
            )
        )
        return result.scalar_one_or_none() is not None

    async def get_seat_usage(self, tenant_id: UUID, seat_type: str):
        """Get seat usage record for a tenant and seat type."""
        from app.licenses.models import SeatUsage

        result = await self.session.execute(
            select(SeatUsage).where(
                SeatUsage.tenant_id == tenant_id,
                SeatUsage.seat_type == seat_type,
            )
        )
        return result.scalar_one_or_none()

    async def is_lab_disabled(self, tenant_id: UUID, required_feature_or_key: str) -> bool:
        """True only when a lab is expressly turned off for this tenant.

        Default is **enabled** (no rows, or only missing aliases). A row with
        ``enabled is True`` on any alias wins over ``enabled is False`` on others.
        """
        from app.tenants.models import TenantLabSetting

        keys = LAB_FEATURE_TO_TENANT_LAB_TYPES.get(required_feature_or_key)
        if keys is None:
            keys = (required_feature_or_key,)
        saw_true = False
        saw_false = False
        for lab_type in keys:
            result = await self.session.execute(
                select(TenantLabSetting).where(
                    TenantLabSetting.tenant_id == tenant_id,
                    TenantLabSetting.lab_type == lab_type,
                )
            )
            setting = result.scalar_one_or_none()
            if setting is None:
                continue
            if setting.enabled is True:
                saw_true = True
            elif setting.enabled is False:
                saw_false = True
        if saw_true:
            return False
        if saw_false:
            return True
        return False

    async def get_central_child_ids(self, parent_tenant_id: UUID) -> list[UUID]:
        """Get all centrally-billed child tenant IDs for a parent."""
        from app.tenants.models import TenantHierarchy

        result = await self.session.execute(
            select(TenantHierarchy.child_tenant_id).where(
                TenantHierarchy.parent_tenant_id == parent_tenant_id,
                TenantHierarchy.billing_mode == "central",
                TenantHierarchy.is_active == True,
            )
        )
        return list(result.scalars().all())

    async def count_active_students(self, tenant_id: UUID) -> int:
        """Count active student memberships in a tenant."""
        from app.students.models import StudentMembership

        result = await self.session.execute(
            select(func.count(StudentMembership.id)).where(
                StudentMembership.tenant_id == tenant_id,
                StudentMembership.is_active == True,
            )
        )
        return result.scalar() or 0

    async def count_instructors(self, tenant_id: UUID) -> int:
        """Count active instructors in a tenant."""
        from app.tenants.models import Membership
        from app.roles.models import Role

        result = await self.session.execute(
            select(func.count(Membership.id))
            .join(Role, Role.id == Membership.role_id, isouter=True)
            .where(
                Membership.tenant_id == tenant_id,
                Membership.is_active == True,
                Role.slug == "instructor",
            )
        )
        return result.scalar() or 0

    async def get_seat_current_count(self, tenant_id: UUID, seat_type: str) -> int:
        """Get the current_count from SeatUsage for a generic seat type."""
        from app.licenses.models import SeatUsage

        result = await self.session.execute(
            select(SeatUsage.current_count).where(
                SeatUsage.tenant_id == tenant_id,
                SeatUsage.seat_type == seat_type,
            )
        )
        return result.scalar() or 0
