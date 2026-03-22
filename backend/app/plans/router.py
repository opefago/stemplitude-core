"""Plan router."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_super_admin
from app.database import get_db

from .schemas import PlanCreate, PlanResponse, PlanUpdate
from .service import PlanService

router = APIRouter()


@router.get("/", response_model=list[PlanResponse])
async def list_plans(
    db: AsyncSession = Depends(get_db),
):
    """List all active plans (public, no auth required)."""
    service = PlanService(db)
    return await service.list_public()


@router.get("/{id}", response_model=PlanResponse)
async def get_plan(
    id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get plan by ID (public for active plans)."""
    service = PlanService(db)
    plan = await service.get_by_id(id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    return plan


@router.post("/", response_model=PlanResponse, status_code=status.HTTP_201_CREATED)
async def create_plan(
    data: PlanCreate,
    db: AsyncSession = Depends(get_db),
    _: None = require_super_admin(),
):
    """Create a plan (super admin)."""
    service = PlanService(db)
    return await service.create(data)


@router.patch("/{id}", response_model=PlanResponse)
async def update_plan(
    id: UUID,
    data: PlanUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = require_super_admin(),
):
    """Update a plan (super admin)."""
    service = PlanService(db)
    plan = await service.update(id, data)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")
    return plan
