"""Find S3/R2 objects under app prefixes that are not referenced by the database."""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import blob_storage
from app.database import async_session_factory

logger = logging.getLogger(__name__)

# Keys created by tenant lab projects / student assets and global admin uploads.
_SCAN_PREFIXES = ("tenants/", "global/")

_BATCH_DELETE = 500


async def collect_referenced_blob_keys(db: AsyncSession) -> set[str]:
    """All object keys that must be kept: primary blobs, stored thumbnails, and derived thumb paths."""
    from app.admin.models import GlobalAsset
    from app.assets.models import Asset
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
    """Load DB references, then scan S3 prefixes and delete unreferenced keys (unless dry_run)."""
    async with async_session_factory() as db:
        referenced = await collect_referenced_blob_keys(db)

    logger.info(
        "blob orphan cleanup: %d referenced keys in DB, dry_run=%s",
        len(referenced),
        dry_run,
    )

    result = await asyncio.to_thread(_scan_and_delete_orphans, referenced, dry_run=dry_run)
    result["dry_run"] = dry_run
    result["referenced_count"] = len(referenced)
    return result
