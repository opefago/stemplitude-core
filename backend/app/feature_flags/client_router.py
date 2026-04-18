"""Lightweight feature flag evaluation endpoint for authenticated clients.

Unlike the platform admin router, this endpoint is accessible to any
authenticated user and returns a simple key → enabled map.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import require_identity

from .service import FeatureFlagService

router = APIRouter()

MAX_KEYS = 25


@router.get("/check")
async def check_flags(
    request: Request,
    keys: str = Query(..., description="Comma-separated flag keys"),
    db: AsyncSession = Depends(get_db),
):
    identity = require_identity(request)
    raw_keys = [k.strip() for k in keys.split(",") if k.strip()][:MAX_KEYS]
    svc = FeatureFlagService(db)
    stage = "production" if settings.is_production else "dev"
    flags: dict[str, bool] = {}
    for key in raw_keys:
        result = await svc.evaluate(
            key,
            user_id=identity.id if identity.sub_type != "student" else None,
            tenant_id=identity.tenant_id,
            traits={},
            stage=stage,
            record_metrics=True,
        )
        flags[key] = result.enabled
    return {"flags": flags}
