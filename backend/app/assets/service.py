"""Assets service."""

import logging
import uuid
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.models import GlobalAsset
from app.core import blob_storage
from app.core.pipeline import Pipeline
from app.dependencies import CurrentIdentity, TenantContext
from app.assets.models import Asset

from .repository import AssetRepository
from .schemas import (
    AssetLibraryResponse,
    AssetListResponse,
    AssetResponse,
    AssetUpdate,
    GlobalAssetResponse,
)

logger = logging.getLogger(__name__)


class AssetsService:
    """Service for asset operations."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = AssetRepository(session)

    def _owner(self, identity: CurrentIdentity) -> tuple[UUID, str]:
        """Resolve owner_id and owner_type from identity."""
        if identity.sub_type == "student":
            return identity.id, "student"
        return identity.id, "user"

    async def _check_asset_access(
        self, asset: Asset, identity: CurrentIdentity
    ) -> None:
        """Raise 403 if the caller has no ownership relationship to the asset.

        Rules:
        - Tenant-owned assets are visible to all tenant members.
        - Students may only access assets they own (plus tenant-owned).
        - Parents may only access assets owned by their linked students.
        - Instructors may access assets owned by students enrolled in their classrooms.
        - Admin / owner roles pass through (full tenant visibility).
        """
        if asset.owner_type == "tenant":
            return

        if identity.sub_type == "student":
            if asset.owner_id != identity.id:
                logger.warning(
                    "Access denied: student=%s tried to access asset=%s owned_by=%s",
                    identity.id, asset.id, asset.owner_id,
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied",
                )
            return

        if asset.owner_type != "student":
            return

        if identity.role == "parent":
            if not await self.repo.is_parent_of_student(identity.id, asset.owner_id):
                logger.warning(
                    "Access denied: parent=%s not linked to student=%s for asset=%s",
                    identity.id, asset.owner_id, asset.id,
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied",
                )
            return

        if identity.role == "instructor":
            if not await self.repo.is_instructor_of_student(identity.id, asset.owner_id):
                logger.warning(
                    "Access denied: instructor=%s has no classroom with student=%s for asset=%s",
                    identity.id, asset.owner_id, asset.id,
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied",
                )

    async def upload_asset(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        file: UploadFile,
        name: str,
        asset_type: str,
        lab_type: str | None = None,
        metadata_: dict | None = None,
        owner_type_override: str | None = None,
    ) -> AssetResponse:
        """Upload asset to R2 and create record.

        Pass ``owner_type_override="tenant"`` to create an asset owned by the
        tenant itself (visible to all members including students).
        """
        if owner_type_override == "tenant":
            if identity.role not in ("owner", "admin", "instructor"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only admins or instructors can create tenant-level assets",
                )
            owner_id = tenant_ctx.tenant_id
            owner_type = "tenant"
        else:
            owner_id, owner_type = self._owner(identity)
        asset_id = uuid.uuid4()
        filename = file.filename or "asset"
        content_type = file.content_type or "application/octet-stream"
        file_data = await file.read()
        file_size = len(file_data)

        key = blob_storage.tenant_asset_key(
            tenant_ctx.tenant_id, owner_id, asset_id, filename
        )
        blob_storage.upload_file(key, file_data, content_type)

        asset = Asset(
            id=asset_id,
            tenant_id=tenant_ctx.tenant_id,
            owner_id=owner_id,
            owner_type=owner_type,
            asset_type=asset_type,
            name=name,
            blob_key=key,
            blob_url=None,
            mime_type=content_type,
            file_size=file_size,
            metadata_=metadata_ or {},
            lab_type=lab_type,
            is_global=False,
            is_active=True,
        )
        asset = await self.repo.create(asset)

        Pipeline.dispatch("thumbnail.generate", {"asset_table": "assets", "asset_id": str(asset.id)})

        logger.info("Asset uploaded id=%s tenant=%s type=%s", asset.id, tenant_ctx.tenant_id, asset_type)
        return self._to_response(asset)

    async def list_assets(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        asset_type: str | None = None,
        lab_type: str | None = None,
        owner_id: UUID | None = None,
        skip: int = 0,
        limit: int = 100,
    ) -> AssetListResponse:
        """List assets with filters."""
        if identity.sub_type == "student":
            owner_id = identity.id
        assets, total = await self.repo.list_assets(
            tenant_ctx.tenant_id,
            asset_type=asset_type,
            lab_type=lab_type,
            owner_id=owner_id,
            skip=skip,
            limit=limit,
        )
        return AssetListResponse(
            items=[self._to_response(a) for a in assets],
            total=total,
        )

    async def get_asset(
        self,
        asset_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        expires_in: int = 3600,
    ) -> AssetResponse:
        """Get asset with signed download URL."""
        asset = await self.repo.get_by_id(asset_id, tenant_ctx.tenant_id)
        if not asset:
            logger.warning("Asset not found id=%s", asset_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Asset not found",
            )
        await self._check_asset_access(asset, identity)
        signed_url = blob_storage.generate_presigned_url(asset.blob_key, expires_in)
        resp = self._to_response(asset)
        return resp.model_copy(update={"blob_url": signed_url})

    async def update_asset(
        self,
        asset_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        data: AssetUpdate,
    ) -> AssetResponse:
        """Update asset metadata."""
        asset = await self.repo.get_by_id(asset_id, tenant_ctx.tenant_id)
        if not asset:
            logger.warning("Asset not found id=%s", asset_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Asset not found",
            )
        await self._check_asset_access(asset, identity)
        for k, v in data.model_dump(exclude_unset=True, by_alias=False).items():
            if k == "metadata_":
                setattr(asset, "metadata_", v)
            else:
                setattr(asset, k, v)
        asset = await self.repo.update(asset)
        return self._to_response(asset)

    async def delete_asset(
        self,
        asset_id: UUID,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
    ) -> None:
        """Delete asset and its blob."""
        asset = await self.repo.get_by_id(asset_id, tenant_ctx.tenant_id)
        if not asset:
            logger.warning("Asset not found id=%s", asset_id)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Asset not found",
            )
        await self._check_asset_access(asset, identity)
        blob_storage.delete_file(asset.blob_key)
        await self.repo.delete(asset)
        logger.info("Asset deleted id=%s", asset_id)

    async def get_library(
        self,
        identity: CurrentIdentity,
        tenant_ctx: TenantContext,
        asset_type: str | None = None,
        lab_type: str | None = None,
    ) -> AssetLibraryResponse:
        """Combined view: own + tenant-shared + global assets."""
        owner_id, owner_type = self._owner(identity)
        own, _ = await self.repo.list_assets(
            tenant_ctx.tenant_id,
            owner_id=owner_id,
            owner_type=owner_type,
            asset_type=asset_type,
            lab_type=lab_type,
            skip=0,
            limit=100,
        )
        tenant_assets, _ = await self.repo.list_assets(
            tenant_ctx.tenant_id,
            owner_type="tenant",
            asset_type=asset_type,
            lab_type=lab_type,
            skip=0,
            limit=50,
        )
        shared: list[Asset] = list(tenant_assets)
        if identity.sub_type == "user":
            other_user_assets, _ = await self.repo.list_assets(
                tenant_ctx.tenant_id,
                owner_type="user",
                asset_type=asset_type,
                lab_type=lab_type,
                skip=0,
                limit=50,
            )
            shared += [a for a in other_user_assets if a.owner_id != owner_id]
        global_assets, _ = await self.repo.list_global_assets(
            asset_type=asset_type,
            lab_type=lab_type,
            skip=0,
            limit=50,
        )
        return AssetLibraryResponse(
            own=[self._to_response(a) for a in own],
            shared=[self._to_response(a) for a in shared],
            global_assets=[self._global_to_response(g) for g in global_assets],
        )

    def _to_response(self, asset: Asset) -> AssetResponse:
        return AssetResponse(
            id=asset.id,
            tenant_id=asset.tenant_id,
            owner_id=asset.owner_id,
            owner_type=asset.owner_type,
            asset_type=asset.asset_type,
            name=asset.name,
            blob_key=asset.blob_key,
            blob_url=asset.blob_url,
            mime_type=asset.mime_type,
            file_size=asset.file_size,
            metadata_=asset.metadata_,
            lab_type=asset.lab_type,
            thumbnail_url=asset.thumbnail_url,
            is_global=asset.is_global,
            is_active=asset.is_active,
            created_at=asset.created_at,
        )

    def _global_to_response(self, g: GlobalAsset) -> "GlobalAssetResponse":
        return GlobalAssetResponse(
            id=g.id,
            uploaded_by_user_id=g.uploaded_by_user_id,
            uploaded_by_org_id=g.uploaded_by_org_id,
            asset_type=g.asset_type,
            name=g.name,
            blob_key=g.blob_key,
            blob_url=g.blob_url,
            mime_type=g.mime_type,
            file_size=g.file_size,
            metadata_=g.metadata_,
            lab_type=g.lab_type,
            category=g.category,
            thumbnail_url=g.thumbnail_url,
            is_active=g.is_active,
            created_at=g.created_at,
        )
