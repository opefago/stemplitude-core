from __future__ import annotations

import logging
from pathlib import Path

import yaml
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.homepage_templates.models import HomepageTemplate

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).resolve().parents[2] / "config" / "homepage_templates.yaml"


def _load_yaml() -> list[dict]:
    if not CONFIG_PATH.exists():
        logger.warning("homepage_templates.yaml not found at %s", CONFIG_PATH)
        return []
    with open(CONFIG_PATH, "r") as f:
        data = yaml.safe_load(f)
    return data.get("templates", [])


async def seed_templates(session: AsyncSession) -> str:
    """Upsert built-in templates from YAML config into the database."""
    yaml_templates = _load_yaml()
    if not yaml_templates:
        return "no templates in YAML"

    result = await session.execute(
        select(HomepageTemplate.slug).where(HomepageTemplate.is_builtin.is_(True))
    )
    existing_slugs: set[str] = set(result.scalars().all())

    inserted, updated = 0, 0
    for tpl in yaml_templates:
        slug = tpl["slug"]
        if slug in existing_slugs:
            row = (
                await session.execute(
                    select(HomepageTemplate).where(HomepageTemplate.slug == slug)
                )
            ).scalar_one()
            row.name = tpl["name"]
            row.category = tpl["category"]
            row.description = tpl.get("description", "")
            row.gradient = tpl.get("gradient", "")
            row.sections = tpl.get("sections", [])
            updated += 1
        else:
            session.add(
                HomepageTemplate(
                    slug=slug,
                    name=tpl["name"],
                    category=tpl["category"],
                    description=tpl.get("description", ""),
                    gradient=tpl.get("gradient", ""),
                    sections=tpl.get("sections", []),
                    is_builtin=True,
                    is_active=True,
                )
            )
            inserted += 1

    await session.commit()
    return f"inserted={inserted}, updated={updated}"


async def list_categories(
    session: AsyncSession, *, active_only: bool = True,
) -> list[str]:
    from sqlalchemy import func

    stmt = select(HomepageTemplate.category).group_by(HomepageTemplate.category).order_by(HomepageTemplate.category)
    if active_only:
        stmt = stmt.where(HomepageTemplate.is_active.is_(True))
    result = await session.execute(stmt)
    return [row[0] for row in result.all()]


async def list_templates(
    session: AsyncSession,
    *,
    active_only: bool = True,
    skip: int = 0,
    limit: int = 20,
    category: str | None = None,
    search: str | None = None,
) -> tuple[list[HomepageTemplate], int]:
    from sqlalchemy import func

    base = select(HomepageTemplate)
    if active_only:
        base = base.where(HomepageTemplate.is_active.is_(True))
    if category:
        base = base.where(HomepageTemplate.category == category)
    if search:
        pattern = f"%{search}%"
        base = base.where(
            HomepageTemplate.name.ilike(pattern)
            | HomepageTemplate.description.ilike(pattern)
        )

    count_result = await session.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar() or 0

    rows_result = await session.execute(
        base.order_by(HomepageTemplate.name).offset(skip).limit(limit)
    )
    return list(rows_result.scalars().all()), total


async def get_template_by_id(
    session: AsyncSession, template_id: str
) -> HomepageTemplate | None:
    result = await session.execute(
        select(HomepageTemplate).where(HomepageTemplate.id == template_id)
    )
    return result.scalar_one_or_none()


async def create_template(
    session: AsyncSession, data: dict
) -> HomepageTemplate:
    tpl = HomepageTemplate(**data, is_builtin=False, is_active=True)
    session.add(tpl)
    await session.flush()
    return tpl


async def update_template(
    session: AsyncSession, tpl: HomepageTemplate, data: dict
) -> HomepageTemplate:
    for k, v in data.items():
        if v is not None:
            setattr(tpl, k, v)
    await session.flush()
    return tpl


async def delete_template(session: AsyncSession, tpl: HomepageTemplate) -> None:
    await session.delete(tpl)
    await session.flush()
