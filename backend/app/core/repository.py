"""Base repository with tenant-scoped query support."""

from typing import Generic, TypeVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

ModelT = TypeVar("ModelT")


class BaseRepository(Generic[ModelT]):
    """Base repository with tenant-scoped query helpers."""

    def __init__(self, session: AsyncSession, model: type[ModelT]):
        self.session = session
        self.model = model

    def _tenant_filter(self, tenant_id: UUID | None):
        """Return tenant_id filter if model has tenant_id column."""
        if hasattr(self.model, "tenant_id"):
            return self.model.tenant_id == tenant_id
        return None

    def _scope_query(self, query, tenant_id: UUID | None):
        """Apply tenant scope to query if tenant_id provided and model supports it."""
        if tenant_id is not None:
            filt = self._tenant_filter(tenant_id)
            if filt is not None:
                return query.where(filt)
        return query
