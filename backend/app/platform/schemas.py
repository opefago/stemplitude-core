"""Pydantic schemas for the platform command API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class CommandRequest(BaseModel):
    command: str = Field(
        ...,
        min_length=3,
        max_length=512,
        description="Command string, e.g. 'tenants:list --active-only true'",
        examples=["tenants:list", "users:set-role -e admin@co.com -r devops"],
    )


class CommandResponse(BaseModel):
    ok: bool
    command: str
    result: dict[str, Any] | None = None
    error: str | None = None


class HistoryEntry(BaseModel):
    id: str
    command: str
    timestamp: int
    status: str
    output: str


class HistoryListResponse(BaseModel):
    items: list[HistoryEntry]
    count: int


class HistoryDeleteResponse(BaseModel):
    deleted: bool
