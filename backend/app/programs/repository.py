"""Program repository."""

from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.classrooms.models import Classroom
from app.curriculum.models import Course
from app.programs.models import Program


class ProgramRepository:
    """Repository for program queries."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, program_id: UUID, tenant_id: UUID) -> Program | None:
        """Get program by ID within tenant."""
        result = await self.session.execute(
            select(Program).where(
                Program.id == program_id,
                Program.tenant_id == tenant_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_by_tenant(
        self,
        tenant_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
        is_active: bool | None = None,
    ) -> list[Program]:
        """List programs for a tenant."""
        query = select(Program).where(Program.tenant_id == tenant_id)
        if is_active is not None:
            query = query.where(Program.is_active == is_active)
        query = query.order_by(Program.name).offset(skip).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def count_linked_curricula(self, program_id: UUID, tenant_id: UUID) -> int:
        result = await self.session.execute(
            select(func.count(Course.id)).where(
                Course.tenant_id == tenant_id,
                Course.program_id == program_id,
            )
        )
        return int(result.scalar_one() or 0)

    async def count_linked_classrooms(self, program_id: UUID, tenant_id: UUID) -> int:
        result = await self.session.execute(
            select(func.count(Classroom.id)).where(
                Classroom.tenant_id == tenant_id,
                Classroom.deleted_at.is_(None),
                Classroom.program_id == program_id,
            )
        )
        return int(result.scalar_one() or 0)

    async def bulk_attach_curricula(
        self,
        *,
        tenant_id: UUID,
        program_id: UUID,
        curriculum_ids: list[UUID],
    ) -> int:
        if not curriculum_ids:
            return 0
        result = await self.session.execute(
            update(Course)
            .where(
                Course.tenant_id == tenant_id,
                Course.id.in_(curriculum_ids),
            )
            .values(program_id=program_id)
        )
        return int(result.rowcount or 0)
