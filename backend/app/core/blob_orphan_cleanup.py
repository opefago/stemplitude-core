"""Find S3/R2 objects under app prefixes that are not referenced by the database.

Also repairs DB rows that still reference keys whose objects no longer exist in storage
(stale ``projects`` / ``assets`` / ``global_assets`` after manual deletes or failed uploads).
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import blob_storage

logger = logging.getLogger(__name__)

_PLACEHOLDER_BLOB_KEYS = frozenset({"", "pending"})

# Keys created by tenant lab projects / student assets and global admin uploads.
_SCAN_PREFIXES = ("tenants/", "global/")

_BATCH_DELETE = 500


def _normalized_blob_key(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or s.lower() in _PLACEHOLDER_BLOB_KEYS:
        return None
    return s


async def _object_exists(key: str) -> bool:
    return await asyncio.to_thread(blob_storage.head_file, key) is not None


async def repair_db_rows_missing_blobs(db: AsyncSession, *, dry_run: bool) -> dict[str, int]:
    """Fix rows that reference storage keys with no object (broken links).

    * ``projects``: clear ``blob_key`` / ``blob_url`` when the main object is missing.
    * ``assets`` / ``global_assets``: set ``is_active=False`` and clear URL fields when the
      main blob is missing (``blob_key`` stays for audit; not nullable).
    * Thumbnails: clear ``thumbnail_key`` / ``thumbnail_url`` when that object is missing
      but the primary blob still exists.
    """
    from app.admin.models import GlobalAsset
    from app.assets.models import Asset
    from app.labs.models import Project

    stats = {
        "projects_blob_cleared": 0,
        "projects_would_clear_blob": 0,
        "assets_deactivated": 0,
        "assets_would_deactivate": 0,
        "assets_thumb_cleared": 0,
        "assets_would_clear_thumb": 0,
        "global_assets_deactivated": 0,
        "global_assets_would_deactivate": 0,
        "global_assets_thumb_cleared": 0,
        "global_assets_would_clear_thumb": 0,
    }

    # --- projects (nullable blob_key) ---
    r = await db.execute(select(Project.id, Project.blob_key).where(Project.blob_key.isnot(None)))
    for pid, bk in r.all():
        key = _normalized_blob_key(bk)
        if not key:
            continue
        if await _object_exists(key):
            continue
        if dry_run:
            stats["projects_would_clear_blob"] += 1
        else:
            await db.execute(
                update(Project)
                .where(Project.id == pid)
                .values(blob_key=None, blob_url=None)
            )
            stats["projects_blob_cleared"] += 1

    # --- tenant assets ---
    r = await db.execute(
        select(Asset.id, Asset.blob_key, Asset.thumbnail_key).where(Asset.is_active.is_(True))
    )
    for aid, bk, tk in r.all():
        main = _normalized_blob_key(bk)
        if not main:
            continue
        main_ok = await _object_exists(main)
        if not main_ok:
            if dry_run:
                stats["assets_would_deactivate"] += 1
            else:
                await db.execute(
                    update(Asset)
                    .where(Asset.id == aid)
                    .values(
                        is_active=False,
                        blob_url=None,
                        thumbnail_key=None,
                        thumbnail_url=None,
                    )
                )
                stats["assets_deactivated"] += 1
            continue

        thumb = _normalized_blob_key(tk)
        if thumb and not await _object_exists(thumb):
            if dry_run:
                stats["assets_would_clear_thumb"] += 1
            else:
                await db.execute(
                    update(Asset)
                    .where(Asset.id == aid)
                    .values(thumbnail_key=None, thumbnail_url=None)
                )
                stats["assets_thumb_cleared"] += 1

    # --- global assets ---
    r = await db.execute(
        select(GlobalAsset.id, GlobalAsset.blob_key, GlobalAsset.thumbnail_key).where(
            GlobalAsset.is_active.is_(True)
        )
    )
    for gid, bk, tk in r.all():
        main = _normalized_blob_key(bk)
        if not main:
            continue
        main_ok = await _object_exists(main)
        if not main_ok:
            if dry_run:
                stats["global_assets_would_deactivate"] += 1
            else:
                await db.execute(
                    update(GlobalAsset)
                    .where(GlobalAsset.id == gid)
                    .values(
                        is_active=False,
                        blob_url=None,
                        thumbnail_key=None,
                        thumbnail_url=None,
                    )
                )
                stats["global_assets_deactivated"] += 1
            continue

        thumb = _normalized_blob_key(tk)
        if thumb and not await _object_exists(thumb):
            if dry_run:
                stats["global_assets_would_clear_thumb"] += 1
            else:
                await db.execute(
                    update(GlobalAsset)
                    .where(GlobalAsset.id == gid)
                    .values(thumbnail_key=None, thumbnail_url=None)
                )
                stats["global_assets_thumb_cleared"] += 1

    if not dry_run and any(
        stats[k]
        for k in (
            "projects_blob_cleared",
            "assets_deactivated",
            "assets_thumb_cleared",
            "global_assets_deactivated",
            "global_assets_thumb_cleared",
        )
    ):
        await db.commit()

    return stats


async def collect_referenced_blob_keys(db: AsyncSession) -> set[str]:
    """All object keys that must be kept: primary blobs, stored thumbnails, and derived thumb paths."""
    from app.admin.models import GlobalAsset
    from app.assets.models import Asset
    from app.classrooms.models import SessionRecording
    from app.labs.models import Project

    refs: set[str] = set()

    r = await db.execute(select(Project.blob_key).where(Project.blob_key.isnot(None)))
    for (k,) in r.all():
        if not k or not str(k).strip():
            continue
        k = str(k).strip()
        refs.add(k)
        refs.add(blob_storage.thumbnail_key_for(k))

    r = await db.execute(select(Asset.blob_key, Asset.thumbnail_key))
    for bk, tk in r.all():
        if bk and str(bk).strip():
            bk = str(bk).strip()
            refs.add(bk)
            refs.add(blob_storage.thumbnail_key_for(bk))
        if tk and str(tk).strip():
            refs.add(str(tk).strip())

    r = await db.execute(select(GlobalAsset.blob_key, GlobalAsset.thumbnail_key))
    for bk, tk in r.all():
        if bk and str(bk).strip():
            bk = str(bk).strip()
            refs.add(bk)
            refs.add(blob_storage.thumbnail_key_for(bk))
        if tk and str(tk).strip():
            refs.add(str(tk).strip())

    r = await db.execute(
        select(SessionRecording.blob_key).where(
            SessionRecording.deleted_at.is_(None),
            SessionRecording.blob_key.isnot(None),
        )
    )
    for (bk,) in r.all():
        if bk and str(bk).strip():
            refs.add(str(bk).strip())

    return refs


def _scan_and_delete_orphans(referenced: set[str], *, dry_run: bool) -> dict[str, int]:
    scanned = 0
    removed = 0
    pending: list[str] = []

    def flush() -> None:
        nonlocal removed, pending
        if not pending:
            return
        if dry_run:
            removed += len(pending)
        else:
            removed += blob_storage.delete_objects_batch(pending)
        pending = []

    for prefix in _SCAN_PREFIXES:
        for key in blob_storage.iter_object_keys(prefix):
            scanned += 1
            if key in referenced:
                continue
            pending.append(key)
            if len(pending) >= _BATCH_DELETE:
                flush()
    flush()

    return {"scanned": scanned, "removed": removed}


async def run_orphan_blob_cleanup(*, dry_run: bool) -> dict[str, int | bool]:
    """Repair DB rows pointing at missing objects, then delete unreferenced S3 keys."""
    import app.database as db_mod

    async with db_mod.async_session_factory() as db:
        db_repair = await repair_db_rows_missing_blobs(db, dry_run=dry_run)
        referenced = await collect_referenced_blob_keys(db)

    logger.info(
        "blob orphan cleanup: db_repair=%s referenced_keys=%d dry_run=%s",
        db_repair,
        len(referenced),
        dry_run,
    )

    result = await asyncio.to_thread(_scan_and_delete_orphans, referenced, dry_run=dry_run)
    result["dry_run"] = dry_run
    result["referenced_count"] = len(referenced)
    result["db_repair"] = db_repair
    return result
