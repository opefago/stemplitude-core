"""Integrations router."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import require_identity, TenantContext

from .schemas import (
    CalendarSummary,
    ConnectRedirect,
    OAuthConnectionResponse,
    OAuthConnectionUpdate,
)
from .service import IntegrationService

router = APIRouter()


def _get_tenant_optional(request: Request) -> TenantContext | None:
    return getattr(request.state, "tenant", None)


@router.get("/connections", response_model=list[OAuthConnectionResponse])
async def list_connections(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("integrations", "view"),
):
    """List OAuth connections for the current user."""
    identity = require_identity(request)
    tenant = _get_tenant_optional(request)
    service = IntegrationService(db)
    return await service.list_connections(identity, tenant)


@router.get("/connect/{provider}", response_model=ConnectRedirect)
async def get_connect_url(
    provider: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("integrations", "create"),
):
    """Get OAuth authorization URL to connect a provider."""
    identity = require_identity(request)
    tenant = _get_tenant_optional(request)
    service = IntegrationService(db)
    result = await service.get_connect_url(provider, identity, tenant)
    if not result:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid provider")
    return result


@router.get("/callback/{provider}")
async def oauth_callback(
    provider: str,
    request: Request,
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """OAuth callback - exchange code for tokens and save connection."""
    identity = require_identity(request)
    tenant = _get_tenant_optional(request)
    service = IntegrationService(db)
    result = await service.handle_callback(provider, code, state, identity, tenant)
    if not result:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to connect")
    return result


@router.delete("/connections/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("integrations", "delete"),
):
    """Delete OAuth connection."""
    identity = require_identity(request)
    service = IntegrationService(db)
    deleted = await service.delete_connection(id, identity)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")


@router.patch("/connections/{id}/calendar", response_model=OAuthConnectionResponse)
async def update_calendar_settings(
    id: UUID,
    data: OAuthConnectionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("integrations", "update"),
):
    """Update calendar sync settings for connection."""
    identity = require_identity(request)
    service = IntegrationService(db)
    result = await service.update_calendar_settings(id, data, identity)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found")
    return result


@router.get("/connections/{id}/calendars", response_model=list[CalendarSummary])
async def list_calendars(
    id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("integrations", "view"),
):
    """List calendars available for a connection."""
    identity = require_identity(request)
    service = IntegrationService(db)
    return await service.list_calendars(id, identity)
