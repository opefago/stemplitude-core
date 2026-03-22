"""Email router."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_super_admin
from app.database import get_db

from .schemas import EmailLogListResponse, EmailProviderResponse, EmailProviderUpdate
from .service import EmailService

router = APIRouter()


@router.get("/providers", response_model=list[EmailProviderResponse])
async def list_providers(
    db: AsyncSession = Depends(get_db),
    _: None = require_super_admin(),
):
    """List email providers (super admin only)."""
    service = EmailService(db)
    return await service.list_providers()


@router.patch("/providers/{id}", response_model=EmailProviderResponse)
async def update_provider(
    id: UUID,
    data: EmailProviderUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = require_super_admin(),
):
    """Update email provider (super admin only)."""
    service = EmailService(db)
    provider = await service.update_provider(id, data)
    if not provider:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provider not found")
    return provider


@router.get("/logs", response_model=EmailLogListResponse)
async def list_logs(
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    provider: str | None = Query(None),
    status: str | None = Query(None),
    _: None = require_super_admin(),
):
    """List email logs (super admin only)."""
    service = EmailService(db)
    return await service.list_logs(
        skip=skip,
        limit=limit,
        provider=provider,
        status=status,
    )
