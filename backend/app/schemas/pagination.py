"""Standard offset pagination envelope for list APIs."""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Paginated(BaseModel, Generic[T]):
    """`skip` / `limit` offset pagination (not cursor)."""

    items: list[T] = Field(default_factory=list)
    total: int = Field(..., ge=0, description="Total rows matching the query (not just this page)")
    skip: int = Field(0, ge=0)
    limit: int = Field(50, ge=1)
