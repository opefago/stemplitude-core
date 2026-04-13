import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import blob_storage
from app.core.permissions import require_permission
from app.database import get_db
from app.dependencies import TenantContext, get_tenant_context
from app.lesson_content.models import MediaUpload, VideoAsset

router = APIRouter()


@router.post("/r2/upload/init", dependencies=[require_permission("assets", "create")])
async def init_r2_upload(
    filename: str,
    mime_type: str,
    size_bytes: int | None = None,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    upload_id = uuid.uuid4()
    key = f"tenants/{tenant.tenant_id}/lesson-media/{upload_id}/{filename}"
    upload = MediaUpload(
        id=upload_id,
        tenant_id=tenant.tenant_id,
        provider="r2",
        storage_key=key,
        status="pending",
        mime_type=mime_type,
        size_bytes=size_bytes,
    )
    db.add(upload)
    await db.flush()
    return {"upload_id": upload.id, "storage_key": key}


@router.post("/r2/upload/complete", dependencies=[require_permission("assets", "create")])
async def complete_r2_upload(
    upload_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    upload = await db.get(MediaUpload, upload_id)
    if not upload or upload.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")
    upload.status = "completed"
    await db.flush()
    return {"upload_id": upload.id, "status": upload.status, "storage_key": upload.storage_key}


@router.post("/r2/upload/local", dependencies=[require_permission("assets", "create")])
async def upload_local_file_to_r2(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    filename = Path(file.filename or "").name
    if not filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File name is required")

    upload_id = uuid.uuid4()
    storage_key = f"tenants/{tenant.tenant_id}/lesson-media/{upload_id}/{filename}"
    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")

    mime_type = file.content_type or "application/octet-stream"
    blob_storage.upload_file(storage_key, content, mime_type)

    upload = MediaUpload(
        id=upload_id,
        tenant_id=tenant.tenant_id,
        provider="r2",
        storage_key=storage_key,
        status="completed",
        mime_type=mime_type,
        size_bytes=len(content),
    )
    db.add(upload)
    await db.flush()

    return {
        "upload_id": upload.id,
        "status": upload.status,
        "storage_key": storage_key,
        "filename": filename,
        "size_bytes": len(content),
        "mime_type": mime_type,
    }


@router.get("/playback/{video_asset_id}", dependencies=[require_permission("assets", "view")])
async def get_playback_descriptor(
    video_asset_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    asset = (
        await db.execute(
            select(VideoAsset).where(
                VideoAsset.id == video_asset_id,
                ((VideoAsset.tenant_id == tenant.tenant_id) | (VideoAsset.tenant_id.is_(None))),
            )
        )
    ).scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video asset not found")

    if asset.provider == "youtube":
        return {
            "provider": "youtube",
            "reference": asset.provider_ref,
            "embed_url": f"https://www.youtube.com/embed/{asset.provider_ref}",
            "title": asset.title,
            "thumbnail_url": asset.thumbnail_url,
        }

    return {
        "provider": "r2",
        "reference": asset.provider_ref,
        "playback_url": blob_storage.generate_presigned_url(asset.provider_ref),
        "title": asset.title,
        "thumbnail_url": asset.thumbnail_url,
    }


@router.post("/youtube/sync", dependencies=[require_permission("assets", "update")])
async def sync_youtube_metadata(
    video_asset_id: uuid.UUID,
    title: str | None = None,
    duration_seconds: int | None = None,
    thumbnail_url: str | None = None,
    db: AsyncSession = Depends(get_db),
    tenant: TenantContext = Depends(get_tenant_context),
):
    asset = await db.get(VideoAsset, video_asset_id)
    if not asset or (asset.tenant_id not in {None, tenant.tenant_id}):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video asset not found")
    if asset.provider != "youtube":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only YouTube assets can be synced")

    if title is not None:
        asset.title = title
    if duration_seconds is not None:
        asset.duration_seconds = duration_seconds
    if thumbnail_url is not None:
        asset.thumbnail_url = thumbnail_url
    await db.flush()
    return {"video_asset_id": asset.id, "provider": asset.provider, "provider_ref": asset.provider_ref}
