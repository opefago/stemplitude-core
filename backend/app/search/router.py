from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import TenantContext, get_tenant_context
from app.lesson_content.schemas import SearchContentResponse
from app.lesson_content.service import LessonTrackService

router = APIRouter()


@router.get("/content", response_model=list[SearchContentResponse], dependencies=[require_permission("curriculum", "view")])
async def search_content(
    q: str = Query(..., min_length=1),
    visibility: str | None = Query(None),
    owner_type: str | None = Query(None),
    limit: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    return await LessonTrackService(db).search_content(
        tenant_id=tenant.tenant_id,
        query=q,
        visibility=visibility,
        owner_type=owner_type,
        limit=limit,
    )
