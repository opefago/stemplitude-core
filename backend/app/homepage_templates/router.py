from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_identity
from app.homepage_templates import service
from app.homepage_templates.schemas import (
    HomepageTemplateCreate,
    HomepageTemplateListResponse,
    HomepageTemplateOut,
    HomepageTemplateUpdate,
)

router = APIRouter()


def _to_out(tpl) -> dict:
    return {
        "id": str(tpl.id),
        "slug": tpl.slug,
        "name": tpl.name,
        "category": tpl.category,
        "description": tpl.description,
        "gradient": tpl.gradient,
        "sections": tpl.sections,
        "is_builtin": tpl.is_builtin,
        "is_active": tpl.is_active,
    }


@router.get("", response_model=HomepageTemplateListResponse)
async def list_templates(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    category: str | None = Query(None),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    templates, total = await service.list_templates(
        db, active_only=True, skip=skip, limit=limit, category=category, search=search,
    )
    return {"items": [_to_out(t) for t in templates], "total": total, "skip": skip, "limit": limit}


@router.get("/categories", response_model=list[str])
async def list_categories(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    return await service.list_categories(db, active_only=True)


@router.get("/{template_id}", response_model=HomepageTemplateOut)
async def get_template(
    template_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    tpl = await service.get_template_by_id(db, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return _to_out(tpl)


@router.post("", response_model=HomepageTemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(
    data: HomepageTemplateCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity=Depends(get_current_identity),
):
    tpl = await service.create_template(db, data.model_dump())
    return _to_out(tpl)


@router.patch("/{template_id}", response_model=HomepageTemplateOut)
async def update_template(
    template_id: str,
    data: HomepageTemplateUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity=Depends(get_current_identity),
):
    tpl = await service.get_template_by_id(db, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    updated = await service.update_template(
        db, tpl, data.model_dump(exclude_unset=True)
    )
    return _to_out(updated)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    identity=Depends(get_current_identity),
):
    tpl = await service.get_template_by_id(db, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    if tpl.is_builtin:
        raise HTTPException(
            status_code=400,
            detail="Built-in templates cannot be deleted. Deactivate them instead.",
        )
    await service.delete_template(db, tpl)
