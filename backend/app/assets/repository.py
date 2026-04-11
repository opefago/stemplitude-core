"""Asset repository."""

from typing import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.models import GlobalAsset
from app.assets.models import Asset
from app.classrooms.models import Classroom, ClassroomStudent
from app.students.models import ParentStudent


class AssetRepository:
    """Repository for asset operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, asset: Asset) -> Asset:
        """Create asset."""
        self.session.add(asset)
        await self.session.flush()
        await self.session.refresh(asset)
        return asset

    async def get_by_id(self, asset_id: UUID, tenant_id: UUID) -> Asset | None:
        """Get asset by ID and tenant."""
        result = await self.session.execute(
            select(Asset).where(
                Asset.id == asset_id,
                Asset.tenant_id == tenant_id,
                Asset.is_active == True,
            )
        )
        return result.scalar_one_or_none()

    async def get_by_id_in_tenants(
        self, asset_id: UUID, tenant_ids: Sequence[UUID]
    ) -> Asset | None:
        """Get asset by ID scoped to any of the given tenants (franchise shared library read)."""
        if not tenant_ids:
            return None
        result = await self.session.execute(
            select(Asset).where(
                Asset.id == asset_id,
                Asset.tenant_id.in_(list(tenant_ids)),
                Asset.is_active == True,
            )
        )
        return result.scalar_one_or_none()

    async def is_parent_of_student(
        self, user_id: UUID, student_id: UUID
    ) -> bool:
        """Check whether a parent-student link exists."""
        result = await self.session.execute(
            select(ParentStudent.id).where(
                ParentStudent.user_id == user_id,
                ParentStudent.student_id == student_id,
            )
        )
        return result.scalar_one_or_none() is not None

    async def is_instructor_of_student(
        self, instructor_id: UUID, student_id: UUID
    ) -> bool:
        """Check whether the student is enrolled in any classroom taught by this instructor."""
        result = await self.session.execute(
            select(ClassroomStudent.id)
            .join(Classroom, ClassroomStudent.classroom_id == Classroom.id)
            .where(
                Classroom.instructor_id == instructor_id,
                ClassroomStudent.student_id == student_id,
                Classroom.is_active == True,
            )
            .limit(1)
        )
        return result.scalar_one_or_none() is not None

    async def list_assets(
        self,
        tenant_id: UUID | Sequence[UUID],
        *,
        owner_id: UUID | None = None,
        owner_type: str | None = None,
        asset_type: str | None = None,
        lab_type: str | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[Asset], int]:
        """List assets with filters, returning items and total count.

        ``tenant_id`` may be a single UUID or a sequence (e.g. child + parent for franchise read).
        """
        if isinstance(tenant_id, UUID):
            tenant_clause = Asset.tenant_id == tenant_id
        else:
            ids = list(tenant_id)
            if not ids:
                return [], 0
            tenant_clause = Asset.tenant_id.in_(ids)
        base_where = [tenant_clause, Asset.is_active == True]
        filters = [
            (owner_id, lambda v: Asset.owner_id == v),
            (owner_type, lambda v: Asset.owner_type == v),
            (asset_type, lambda v: Asset.asset_type == v),
            (lab_type, lambda v: Asset.lab_type == v),
        ]
        clauses = base_where + [build(val) for val, build in filters if val is not None]

        total = (
            await self.session.execute(
                select(func.count()).select_from(Asset).where(*clauses)
            )
        ).scalar() or 0
        items = list(
            (
                await self.session.execute(
                    select(Asset)
                    .where(*clauses)
                    .order_by(Asset.created_at.desc())
                    .offset(skip)
                    .limit(limit)
                )
            ).scalars().all()
        )
        return items, total

    async def update(self, asset: Asset) -> Asset:
        """Update asset."""
        await self.session.flush()
        await self.session.refresh(asset)
        return asset

    async def delete(self, asset: Asset) -> None:
        """Delete asset (soft delete by setting is_active=False or hard delete)."""
        await self.session.delete(asset)
        await self.session.flush()

    async def list_global_assets(
        self,
        *,
        asset_type: str | None = None,
        lab_type: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> tuple[list[GlobalAsset], int]:
        """List global assets, returning items and total count."""
        base_where = [GlobalAsset.is_active == True]
        filters = [
            (asset_type, lambda v: GlobalAsset.asset_type == v),
            (lab_type, lambda v: GlobalAsset.lab_type == v),
        ]
        clauses = base_where + [build(val) for val, build in filters if val is not None]

        total = (
            await self.session.execute(
                select(func.count()).select_from(GlobalAsset).where(*clauses)
            )
        ).scalar() or 0
        items = list(
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
        return items, total
