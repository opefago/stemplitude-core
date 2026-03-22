"""Program service."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.programs.models import Program

logger = logging.getLogger(__name__)

from .repository import ProgramRepository
from .schemas import (
    ProgramBulkLinkCurriculaResponse,
    ProgramCreate,
    ProgramResponse,
    ProgramUpdate,
)


class ProgramService:
    """Program business logic."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = ProgramRepository(session)

    async def create(self, data: ProgramCreate, tenant_id: UUID) -> ProgramResponse:
        """Create a program."""
        program = Program(
            tenant_id=tenant_id,
            name=data.name,
            description=data.description,
            is_active=data.is_active,
            start_date=data.start_date,
            end_date=data.end_date,
        )
        self.session.add(program)
        await self.session.flush()
        await self.session.refresh(program)
        logger.info("Program created id=%s tenant=%s", program.id, tenant_id)
        return ProgramResponse.model_validate(program)

    async def list(
        self,
        tenant_id: UUID,
        *,
        skip: int = 0,
        limit: int = 100,
        is_active: bool | None = None,
    ) -> list[ProgramResponse]:
        """List programs for a tenant."""
        programs = await self.repo.list_by_tenant(
            tenant_id, skip=skip, limit=limit, is_active=is_active
        )
        return [ProgramResponse.model_validate(p) for p in programs]

    async def get_by_id(self, program_id: UUID, tenant_id: UUID) -> ProgramResponse:
        """Get program by ID."""
        program = await self.repo.get_by_id(program_id, tenant_id)
        if not program:
            logger.warning("Program not found id=%s", program_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Program not found",
            )
        return ProgramResponse.model_validate(program)

    async def update(
        self,
        program_id: UUID,
        data: ProgramUpdate,
        tenant_id: UUID,
    ) -> ProgramResponse:
        """Update a program."""
        program = await self.repo.get_by_id(program_id, tenant_id)
        if not program:
            logger.warning("Program not found id=%s", program_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Program not found",
            )
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(program, key, value)
        await self.session.flush()
        await self.session.refresh(program)
        logger.info("Program updated id=%s", program_id)
        return ProgramResponse.model_validate(program)

    async def delete(self, program_id: UUID, tenant_id: UUID) -> None:
        """Delete a program."""
        program = await self.repo.get_by_id(program_id, tenant_id)
        if not program:
            logger.warning("Program not found id=%s", program_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Program not found",
            )
        linked_curricula = await self.repo.count_linked_curricula(program_id, tenant_id)
        linked_classrooms = await self.repo.count_linked_classrooms(program_id, tenant_id)
        if linked_curricula > 0 or linked_classrooms > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Program has linked records. Archive or reassign linked curricula/classes before delete."
                ),
            )
        await self.session.delete(program)
        await self.session.flush()

    async def bulk_attach_curricula(
        self,
        *,
        program_id: UUID,
        tenant_id: UUID,
        curriculum_ids: list[UUID],
    ) -> ProgramBulkLinkCurriculaResponse:
        """Attach many curricula to a program."""
        program = await self.repo.get_by_id(program_id, tenant_id)
        if not program:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Program not found")
        updated_count = await self.repo.bulk_attach_curricula(
            tenant_id=tenant_id,
            program_id=program_id,
            curriculum_ids=curriculum_ids,
        )
        await self.session.flush()
        return ProgramBulkLinkCurriculaResponse(updated_count=updated_count)
