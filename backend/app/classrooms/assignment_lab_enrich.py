"""Attach ``lab_launcher_id`` / ``curriculum_lab_title`` to assignment dicts for API clients."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.curriculum.launcher_map import LAUNCHER_SLUGS, normalize_lab_launcher_id
from app.curriculum.models import Lab


def _parse_uuid(value: object) -> UUID | None:
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value).strip())
    except (ValueError, TypeError):
        return None


async def enrich_assignments_lab_launcher(session: AsyncSession, items: list[dict]) -> None:
    """Mutates each item: resolves curriculum ``lab_id`` UUID to launcher route id + lab title."""
    if not items:
        return

    uuid_ids: set[UUID] = set()
    for it in items:
        uid = _parse_uuid(it.get("lab_id"))
        if uid is not None:
            uuid_ids.add(uid)

    lab_by_id: dict[UUID, Lab] = {}
    if uuid_ids:
        r = await session.execute(select(Lab).where(Lab.id.in_(uuid_ids)))
        for row in r.scalars().all():
            lab_by_id[row.id] = row

    for it in items:
        raw_lid = it.get("lab_id")
        uid = _parse_uuid(raw_lid)
        if uid is not None:
            lab = lab_by_id.get(uid)
            if lab:
                launcher = normalize_lab_launcher_id(lab.lab_type)
                if launcher:
                    it["lab_launcher_id"] = launcher
                it["curriculum_lab_title"] = lab.title
            continue

        # Legacy: assignment stores launcher slug or alias string in lab_id
        if isinstance(raw_lid, str) and raw_lid.strip():
            s = raw_lid.strip()
            low = s.lower()
            if low in LAUNCHER_SLUGS:
                it["lab_launcher_id"] = low
            else:
                resolved = normalize_lab_launcher_id(s)
                if resolved:
                    it["lab_launcher_id"] = resolved
