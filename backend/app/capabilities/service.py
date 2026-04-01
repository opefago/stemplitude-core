"""Capability service."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.capabilities.engine import CapabilityEngine
from app.capabilities.models import Capability, CapabilityRule
from app.dependencies import CurrentIdentity, TenantContext

from .repository import CapabilityEngineRepository, CapabilityRepository
from .schemas import (
    CapabilityCheckResponse,
    CapabilityCreate,
    CapabilityResponse,
    CapabilityRuleResponse,
    CapabilityUpdate,
    LabLauncherItemResponse,
    LabLauncherResponse,
)

# (launcher_tile_id, capability_key) — must match web ``LabLauncher`` / ``labRouting``.
LAB_LAUNCHER_CAPABILITIES: tuple[tuple[str, str], ...] = (
    ("circuit-maker", "access_electronics_lab"),
    ("micro-maker", "access_robotics_lab"),
    ("python-game", "access_python_lab"),
    ("game-maker", "access_game_maker"),
    ("design-maker", "access_design_maker"),
)


class CapabilityService:
    """Capability business logic."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = CapabilityRepository(session)
        self.engine = CapabilityEngine(CapabilityEngineRepository(session))

    async def check(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        capability_key: str,
    ) -> CapabilityCheckResponse:
        """Check if identity has the capability in tenant context."""
        result = await self.engine.can(identity, tenant_ctx, capability_key)
        return CapabilityCheckResponse(allowed=result.allowed, reason=result.reason)

    async def lab_launcher_availability(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> LabLauncherResponse:
        """Resolve which labs appear as available for this tenant (plan + org lab toggles)."""
        labs: list[LabLauncherItemResponse] = []
        for tile_id, cap_key in LAB_LAUNCHER_CAPABILITIES:
            result = await self.engine.can(identity, tenant_ctx, cap_key)
            labs.append(
                LabLauncherItemResponse(
                    id=tile_id,
                    allowed=result.allowed,
                    reason=result.reason,
                )
            )
        return LabLauncherResponse(labs=labs)

    async def list_all(self, *, skip: int = 0, limit: int = 100) -> tuple[list[CapabilityResponse], int]:
        """List all capabilities (admin)."""
        capabilities, total = await self.repo.list_all(skip=skip, limit=limit)
        return [self._to_response(c) for c in capabilities], total

    async def get_by_id(self, capability_id: UUID) -> CapabilityResponse | None:
        """Get capability by ID."""
        cap = await self.repo.get_by_id(capability_id)
        return self._to_response(cap) if cap else None

    async def create(self, data: CapabilityCreate) -> CapabilityResponse:
        """Create a capability (super admin)."""
        cap = Capability(
            key=data.key,
            name=data.name,
            category=data.category,
            description=data.description,
        )
        self.session.add(cap)
        await self.session.flush()

        for r in data.rules:
            rule = CapabilityRule(
                capability_id=cap.id,
                role_required=r.role_required,
                required_feature=r.required_feature,
                seat_type=r.seat_type,
                limit_key=r.limit_key,
            )
            self.session.add(rule)

        await self.session.refresh(cap)
        return self._to_response(cap)

    async def update(self, capability_id: UUID, data: CapabilityUpdate) -> CapabilityResponse | None:
        """Update a capability (super admin)."""
        cap = await self.repo.get_by_id(capability_id)
        if not cap:
            return None

        update_fields = {"key", "name", "category", "description"}
        for field in update_fields:
            val = getattr(data, field, None)
            if val is not None:
                setattr(cap, field, val)

        if data.rules is not None:
            for r in cap.rules:
                self.session.delete(r)
            for r in data.rules:
                rule = CapabilityRule(
                    capability_id=cap.id,
                    role_required=r.role_required,
                    required_feature=r.required_feature,
                    seat_type=r.seat_type,
                    limit_key=r.limit_key,
                )
                self.session.add(rule)

        await self.session.refresh(cap)
        return self._to_response(cap)

    def _to_response(self, cap: Capability) -> CapabilityResponse:
        """Convert Capability model to CapabilityResponse."""
        return CapabilityResponse(
            id=cap.id,
            key=cap.key,
            name=cap.name,
            description=cap.description,
            rules=[CapabilityRuleResponse.model_validate(r) for r in cap.rules],
        )
