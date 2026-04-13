"""Integrations router."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import require_identity, TenantContext

from .schemas import (
    CalendarSummary,
    ConnectRedirect,
    OAuthConnectionResponse,
    OAuthConnectionUpdate,
    YouTubeVideoListResponse,
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
    service = IntegrationService(db)
    tenant = _get_tenant_optional(request)

    try:
        identity = require_identity(request)
    except HTTPException:
        identity = None

    if identity is not None:
        result = await service.handle_callback(provider, code, state, identity, tenant)
        if not result:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to connect")
        return result

    result = await service.handle_callback_with_state(provider, code, state)
    if not result:
        return HTMLResponse(
            content="""
            <html><body style="font-family:sans-serif;padding:24px;">
            <h3>Connection failed</h3>
            <p>Could not complete OAuth connection.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: "oauth:connected", ok: false }, "*");
              }
            </script>
            </body></html>
            """,
            status_code=400,
        )

    return HTMLResponse(
        content="""
        <html><body style="font-family:sans-serif;padding:24px;">
        <h3>Connected successfully</h3>
        <p>You can close this window.</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: "oauth:connected", ok: true }, "*");
            window.close();
          }
        </script>
        </body></html>
        """,
    )


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


@router.get("/youtube/videos", response_model=YouTubeVideoListResponse)
async def list_youtube_videos(
    request: Request,
    source: str = Query("mine", pattern="^(mine|public)$"),
    q: str | None = Query(None),
    page_token: str | None = Query(None),
    max_results: int = Query(12, ge=1, le=25),
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("assets", "view"),
):
    identity = require_identity(request)
    tenant = _get_tenant_optional(request)
    service = IntegrationService(db)
    return await service.list_youtube_videos(
        identity,
        tenant,
        source=source,
        query=q,
        page_token=page_token,
        max_results=max_results,
    )
