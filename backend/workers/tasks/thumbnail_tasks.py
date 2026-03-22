import asyncio
import io
import logging

from workers.celery_app import celery_app

logger = logging.getLogger(__name__)

THUMBNAIL_SIZE = (256, 256)

IMAGE_MIME_TYPES = {
    "image/png", "image/jpeg", "image/jpg", "image/gif",
    "image/webp", "image/bmp", "image/tiff", "image/svg+xml",
}

MODEL_3D_MIME_TYPES = {
    "model/gltf-binary", "model/gltf+json", "model/obj",
    "application/octet-stream",
}

MODEL_3D_EXTENSIONS = {".glb", ".gltf", ".obj", ".stl", ".fbx"}


def _is_3d_model(mime_type: str | None, blob_key: str) -> bool:
    if mime_type and mime_type in MODEL_3D_MIME_TYPES:
        return True
    return any(blob_key.lower().endswith(ext) for ext in MODEL_3D_EXTENSIONS)


def _generate_image_thumbnail(file_data: bytes) -> bytes:
    from PIL import Image

    img = Image.open(io.BytesIO(file_data))
    img.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)

    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
    else:
        img = img.convert("RGB")

    buf = io.BytesIO()
    fmt = "PNG" if img.mode == "RGBA" else "JPEG"
    img.save(buf, format=fmt, quality=85, optimize=True)
    buf.seek(0)
    return buf.read()


def _generate_3d_placeholder() -> bytes:
    """Generate a simple placeholder thumbnail for 3D models.

    Full 3D rendering requires a headless GPU pipeline (trimesh + pyrender).
    For now, generate a labeled placeholder; swap in a real renderer later.
    """
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", THUMBNAIL_SIZE, color=(45, 45, 55))
    draw = ImageDraw.Draw(img)

    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
        small_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
    except (OSError, IOError):
        font = ImageFont.load_default()
        small_font = font

    draw.text((THUMBNAIL_SIZE[0] // 2, THUMBNAIL_SIZE[1] // 2 - 15), "3D", fill=(100, 180, 255), anchor="mm", font=font)
    draw.text((THUMBNAIL_SIZE[0] // 2, THUMBNAIL_SIZE[1] // 2 + 15), "MODEL", fill=(150, 150, 170), anchor="mm", font=small_font)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def generate_thumbnail(self, asset_table: str, asset_id: str):
    """Generate and upload a thumbnail for an asset.

    Args:
        asset_table: "assets" or "global_assets"
        asset_id: UUID string of the asset record
    """
    try:
        asyncio.run(_generate_thumbnail_async(asset_table, asset_id))
    except Exception as exc:
        logger.exception("Thumbnail generation failed for %s/%s", asset_table, asset_id)
        raise self.retry(exc=exc)


async def _generate_thumbnail_async(asset_table: str, asset_id: str):
    from uuid import UUID as _UUID

    from sqlalchemy import select

    from app.core import blob_storage
    from app.database import async_session_factory

    if asset_table == "global_assets":
        from app.admin.models import GlobalAsset as Model
    else:
        from app.assets.models import Asset as Model

    async with async_session_factory() as db:
        result = await db.execute(
            select(Model).where(Model.id == _UUID(asset_id))
        )
        asset = result.scalar_one_or_none()
        if not asset:
            logger.warning("Asset %s/%s not found, skipping thumbnail", asset_table, asset_id)
            return

        if asset.thumbnail_key:
            return

        mime = asset.mime_type or ""
        is_image = mime in IMAGE_MIME_TYPES
        is_model = _is_3d_model(mime, asset.blob_key)

        if not is_image and not is_model:
            return

        if is_image:
            file_data = blob_storage.download_file(asset.blob_key)
            thumb_data = _generate_image_thumbnail(file_data)
        else:
            thumb_data = _generate_3d_placeholder()

        thumb_key = blob_storage.thumbnail_key_for(asset.blob_key)
        blob_storage.upload_file(thumb_key, thumb_data, "image/png")
        thumb_url = blob_storage.generate_presigned_url(thumb_key)

        asset.thumbnail_key = thumb_key
        asset.thumbnail_url = thumb_url
        await db.commit()

        logger.info(
            "Thumbnail generated for %s/%s -> %s",
            asset_table, asset_id, thumb_key,
        )
