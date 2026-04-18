from __future__ import annotations

from pathlib import Path

import yaml
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory

from .repository import FeatureFlagRepository

REQUIRED_KEYS = {"name", "owner", "status", "description", "stage"}


def registry_file_path() -> Path:
    configured = settings.FEATURE_FLAGS_REGISTRY_PATH.strip()
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[2] / "config" / "feature_flags.yaml"


def load_registry_flags() -> list[dict]:
    path = registry_file_path()
    if not path.exists():
        return []
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    rows = raw.get("flags", []) if isinstance(raw, dict) else []
    out: list[dict] = []
    for entry in rows:
        if not isinstance(entry, dict):
            continue
        missing = REQUIRED_KEYS.difference(entry.keys())
        if missing:
            raise ValueError(f"Registry flag '{entry}' missing keys: {sorted(missing)}")
        out.append(entry)
    return out


async def sync_registry_to_db(db: AsyncSession) -> dict:
    rows = load_registry_flags()
    repo = FeatureFlagRepository(db)
    created = 0
    updated = 0
    seen: set[str] = set()
    for row in rows:
        key = str(row["name"]).strip()
        if key in seen:
            raise ValueError(f"Duplicate feature flag key in registry: {key}")
        seen.add(key)
        existing = await repo.get_flag_by_key(key)
        values = {
            "key": key,
            "owner": str(row["owner"]).strip(),
            "status": str(row["status"]).strip(),
            "description": str(row["description"]).strip(),
            "stage": str(row["stage"]).strip(),
            "default_enabled": bool(row.get("default_enabled", False)),
        }
        if existing:
            # Only sync metadata fields from YAML; never overwrite runtime-
            # mutable fields (default_enabled, status) that admins may have
            # changed through the UI.
            for field in ("owner", "description", "stage"):
                setattr(existing, field, values[field])
            updated += 1
            continue
        await repo.create_flag(**values)
        created += 1
    await db.flush()
    return {"loaded": len(rows), "created": created, "updated": updated}


async def sync_registry_startup() -> dict:
    async with async_session_factory() as session:
        result = await sync_registry_to_db(session)
        await session.commit()
        return result

