"""Gamification API router."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import get_current_identity, get_tenant_context, require_identity, CurrentIdentity, TenantContext
from app.students.me_student import optional_me_student_id_for_leaderboard, require_me_student_id
from app.students.parent_access import ensure_can_view_student_as_guardian
from app.schemas.pagination import Paginated

from .schemas import (
    AwardBadgeRequest,
    AwardXPRequest,
    RevokeBadgeRequest,
    BadgeDefinitionOut,
    CreateShoutoutRequest,
    CrownWinnersRequest,
    GamificationGoalCreateRequest,
    GamificationGoalOut,
    GamificationGoalUpdateRequest,
    GamificationProfile,
    HallOfFameResponse,
    LabEventIngestRequest,
    LabEventIngestResponse,
    LeaderboardResponse,
    ShoutoutListResponse,
    StudentBadgeOut,
    TenantGamificationConfig,
    UpdateTenantGamificationConfigRequest,
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
    me_student_id: uuid.UUID = Depends(require_me_student_id),
    calendar_tz: str = Query(
        "UTC",
        max_length=80,
        description="IANA timezone for streak week dots (e.g. America/New_York).",
    ),
    _: None = require_permission("gamification", "view"),
):
    """Learner profile: student JWT, or guardian + X-Child-Context."""
    tenant = _tenant(request)
    svc = GamificationService(db)
    return await svc.get_profile(me_student_id, tenant, calendar_tz=calendar_tz)


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    request: Request,
    db: AsyncSession = Depends(get_db),
    viewer_student_id: uuid.UUID | None = Depends(optional_me_student_id_for_leaderboard),
    limit: int = Query(10, ge=1, le=50),
    _: None = require_permission("gamification", "view"),
):
    """Top students by total XP for the tenant."""
    tenant = _tenant(request)
    svc = GamificationService(db)
    return await svc.get_leaderboard(tenant, limit, viewer_student_id)


@router.get("/badges", response_model=Paginated[BadgeDefinitionOut])
async def list_badges(
    request: Request,
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    _: None = require_permission("gamification", "view"),
):
    """Badge definitions for this tenant (paginated)."""
    from .repository import GamificationRepository
    tenant = _tenant(request)
    repo = GamificationRepository(db)
    rows, total = await repo.list_badge_definitions(
        tenant.tenant_id, skip=skip, limit=limit
    )
    items = [BadgeDefinitionOut.model_validate(r) for r in rows]
    return Paginated(items=items, total=total, skip=skip, limit=limit)


@router.get("/shoutouts", response_model=ShoutoutListResponse)
async def list_shoutouts(
    request: Request,
    db: AsyncSession = Depends(get_db),
    student_id: uuid.UUID | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    identity: CurrentIdentity = Depends(get_current_identity),
    _: None = require_permission("gamification", "view"),
):
    """Shoutout feed for the tenant (optionally filtered to one student)."""
    tenant = _tenant(request)
    if student_id is not None:
        await ensure_can_view_student_as_guardian(
            db,
            identity=identity,
            student_id=student_id,
            tenant_id=tenant.tenant_id,
        )
    svc = GamificationService(db)
    return await svc.list_shoutouts(tenant, student_id, limit, offset)


@router.get("/students/{student_id}", response_model=GamificationProfile)
async def get_student_profile(
    student_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity: CurrentIdentity = Depends(get_current_identity),
    calendar_tz: str = Query(
        "UTC",
        max_length=80,
        description="IANA timezone for streak week dots (e.g. America/New_York).",
    ),
    _: None = require_permission("gamification", "view"),
):
    """Staff or linked parent view of a student's gamification profile."""
    tenant = _tenant(request)
    await ensure_can_view_student_as_guardian(
        db,
        identity=identity,
        student_id=student_id,
        tenant_id=tenant.tenant_id,
    )
    svc = GamificationService(db)
    return await svc.get_profile(student_id, tenant, calendar_tz=calendar_tz)


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


@router.post("/badges/revoke", status_code=status.HTTP_200_OK)
async def revoke_badge(
    data: RevokeBadgeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("gamification", "delete"),
):
    """Remove a badge previously awarded to a student (display only; XP already earned is unchanged)."""
    tenant = _tenant(request)
    svc = GamificationService(db)
    removed = await svc.revoke_badge(data.student_id, data.badge_slug, tenant)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Badge not found for this student or unknown slug.",
        )
    return {"detail": "Badge removed"}


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
    from app.students.models import Student
    tenant = _tenant(request)
    identity = require_identity(request)
    from_id = identity.id

    # Resolve names
    from_user = await db.get(User, from_id)
    to_student = await db.get(Student, data.to_student_id)
    if not to_student:
        raise HTTPException(status_code=404, detail="Student not found.")

    from_name = f"{from_user.first_name} {from_user.last_name}".strip() if from_user else "Staff"
    to_name = f"{to_student.first_name} {to_student.last_name}".strip()

    svc = GamificationService(db)
    return await svc.create_shoutout(
        from_id, from_name, data.to_student_id, to_name,
        tenant, data.message, data.emoji, data.classroom_id,
    )


# ── Tenant-focused gamification config + goals ───────────────────────────────

@router.get("/config", response_model=TenantGamificationConfig)
async def get_tenant_gamification_config(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("gamification", "view"),
):
    tenant = _tenant(request)
    svc = GamificationService(db)
    return await svc.get_tenant_config(tenant)


@router.patch("/config", response_model=TenantGamificationConfig)
async def update_tenant_gamification_config(
    data: UpdateTenantGamificationConfigRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("gamification", "create"),
):
    tenant = _tenant(request)
    svc = GamificationService(db)
    try:
        return await svc.update_tenant_config(tenant, data)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/goals", response_model=list[GamificationGoalOut])
async def list_gamification_goals(
    request: Request,
    db: AsyncSession = Depends(get_db),
    lab_type: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    _: None = require_permission("gamification", "view"),
):
    tenant = _tenant(request)
    svc = GamificationService(db)
    return await svc.list_goals(tenant, lab_type=lab_type, is_active=is_active)


@router.post("/goals", response_model=GamificationGoalOut, status_code=status.HTTP_201_CREATED)
async def create_gamification_goal(
    data: GamificationGoalCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("gamification", "create"),
):
    tenant = _tenant(request)
    identity = require_identity(request)
    svc = GamificationService(db)
    return await svc.create_goal(tenant, identity.id, data)


@router.patch("/goals/{goal_id}", response_model=GamificationGoalOut)
async def update_gamification_goal(
    goal_id: uuid.UUID,
    data: GamificationGoalUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("gamification", "create"),
):
    tenant = _tenant(request)
    identity = require_identity(request)
    svc = GamificationService(db)
    updated = await svc.update_goal(tenant, goal_id, identity.id, data)
    if updated is None:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return updated


@router.delete("/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gamification_goal(
    goal_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("gamification", "create"),
):
    tenant = _tenant(request)
    svc = GamificationService(db)
    ok = await svc.delete_goal(tenant, goal_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Goal not found.")
    return None


@router.post("/events/ingest", response_model=LabEventIngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest_lab_event(
    data: LabEventIngestRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = require_permission("gamification", "create"),
):
    tenant = _tenant(request)
    identity = require_identity(request)
    svc = GamificationService(db)
    return await svc.ingest_lab_event(tenant, identity.id, data)
