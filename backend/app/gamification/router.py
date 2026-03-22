"""Gamification API router."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import get_tenant_context, require_identity, TenantContext

from .schemas import (
    AwardBadgeRequest,
    AwardXPRequest,
    BadgeDefinitionOut,
    CreateShoutoutRequest,
    CrownWinnersRequest,
    GamificationProfile,
    HallOfFameResponse,
    LeaderboardResponse,
    ShoutoutListResponse,
    StudentBadgeOut,
    WeeklyWinnerOut,
)
from .service import GamificationService

router = APIRouter()


def _tenant(request: Request) -> TenantContext:
    tenant = getattr(request.state, "tenant", None)
    if tenant is None:
        raise HTTPException(status_code=400, detail="Tenant context required.")
    return tenant


# ── Student self-service ──────────────────────────────────────────────────────

@router.get("/me", response_model=GamificationProfile)
async def get_my_profile(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("gamification", "view"),
):
    """Return the calling student's full gamification profile."""
    tenant = _tenant(request)
    identity = require_identity(request)
    svc = GamificationService(db)
    return await svc.get_profile(identity.id, tenant)


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    request: Request,
    db: AsyncSession = Depends(get_db),
    limit: int = Query(10, ge=1, le=50),
    _: None = require_permission("gamification", "view"),
):
    """Top students by total XP for the tenant."""
    tenant = _tenant(request)
    identity = require_identity(request)
    svc = GamificationService(db)
    return await svc.get_leaderboard(tenant, limit, identity.id)


@router.get("/badges", response_model=list[BadgeDefinitionOut])
async def list_badges(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("gamification", "view"),
):
    """All badge definitions available in this tenant."""
    from .repository import GamificationRepository
    tenant = _tenant(request)
    repo = GamificationRepository(db)
    return await repo.list_badge_definitions(tenant.tenant_id)


@router.get("/shoutouts", response_model=ShoutoutListResponse)
async def list_shoutouts(
    request: Request,
    db: AsyncSession = Depends(get_db),
    student_id: uuid.UUID | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _: None = require_permission("gamification", "view"),
):
    """Shoutout feed for the tenant (optionally filtered to one student)."""
    tenant = _tenant(request)
    svc = GamificationService(db)
    return await svc.list_shoutouts(tenant, student_id, limit, offset)


@router.get("/students/{student_id}", response_model=GamificationProfile)
async def get_student_profile(
    student_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("gamification", "view"),
):
    """Instructor/admin view of any student's gamification profile."""
    tenant = _tenant(request)
    svc = GamificationService(db)
    return await svc.get_profile(student_id, tenant)


# ── Instructor / Admin actions ────────────────────────────────────────────────

@router.post("/xp", status_code=status.HTTP_201_CREATED)
async def award_xp(
    data: AwardXPRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("gamification", "create"),
):
    """Manually award XP to a student."""
    tenant = _tenant(request)
    svc = GamificationService(db)
    await svc.award_xp(data.student_id, tenant, data.amount, data.reason, data.source)
    return {"detail": f"Awarded {data.amount} XP"}


@router.post("/badges/award", response_model=StudentBadgeOut, status_code=status.HTTP_201_CREATED)
async def award_badge(
    data: AwardBadgeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("gamification", "create"),
):
    """Award a badge to a student by slug."""
    tenant = _tenant(request)
    identity = require_identity(request)
    svc = GamificationService(db)
    result = await svc.award_badge(
        data.student_id, data.badge_slug, tenant, identity.id
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Badge not found or already awarded.",
        )
    return result


@router.get("/weekly-winners", response_model=HallOfFameResponse)
async def get_hall_of_fame(
    request: Request,
    db: AsyncSession = Depends(get_db),
    limit_weeks: int = Query(8, ge=1, le=52),
    _: None = require_permission("gamification", "view"),
):
    """Hall of fame — past weekly winners grouped by week."""
    tenant = _tenant(request)
    svc = GamificationService(db)
    return await svc.get_hall_of_fame(tenant, limit_weeks)


@router.get("/weekly-winners/current", response_model=list[WeeklyWinnerOut])
async def get_current_week_winners(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("gamification", "view"),
):
    """Return winners crowned for the current ISO week (empty list if not yet crowned)."""
    tenant = _tenant(request)
    svc = GamificationService(db)
    return await svc.get_current_week_winners(tenant)


@router.post(
    "/weekly-winners/crown",
    response_model=list[WeeklyWinnerOut],
    status_code=status.HTTP_201_CREATED,
)
async def crown_weekly_winners(
    data: CrownWinnersRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("gamification", "create"),
):
    """Admin/instructor crowns top-N students for the current week."""
    tenant = _tenant(request)
    identity = require_identity(request)
    svc = GamificationService(db)
    return await svc.crown_weekly_winners(tenant, identity.id, data.top_n)


@router.post("/shoutouts", response_model=ShoutoutListResponse.model_fields["items"].annotation.__args__[0], status_code=status.HTTP_201_CREATED)
async def create_shoutout(
    data: CreateShoutoutRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("gamification", "create"),
):
    """Send a shoutout to a student."""
    from app.users.models import User
    tenant = _tenant(request)
    identity = require_identity(request)
    from_id = identity.id

    # Resolve names
    from_user = await db.get(User, from_id)
    to_user = await db.get(User, data.to_student_id)
    if not to_user:
        raise HTTPException(status_code=404, detail="Student not found.")

    from_name = f"{from_user.first_name} {from_user.last_name}".strip() if from_user else "Staff"
    to_name = f"{to_user.first_name} {to_user.last_name}".strip()

    svc = GamificationService(db)
    return await svc.create_shoutout(
        from_id, from_name, data.to_student_id, to_name,
        tenant, data.message, data.emoji, data.classroom_id,
    )
