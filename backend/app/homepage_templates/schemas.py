from __future__ import annotations

from pydantic import BaseModel, Field


class HomepageTemplateOut(BaseModel):
    id: str
    slug: str
    name: str
    category: str
    description: str
    gradient: str
    sections: list[dict]
    is_builtin: bool
    is_active: bool


class HomepageTemplateListResponse(BaseModel):
    items: list[HomepageTemplateOut]
    total: int
    skip: int
    limit: int


class HomepageTemplateCreate(BaseModel):
    slug: str = Field(min_length=2, max_length=120)
    name: str = Field(min_length=2, max_length=200)
    category: str = Field(min_length=2, max_length=40)
    description: str = Field(default="", max_length=1000)
    gradient: str = Field(default="", max_length=300)
    sections: list[dict] = Field(default_factory=list)


class HomepageTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    category: str | None = Field(default=None, max_length=40)
    description: str | None = Field(default=None, max_length=1000)
    gradient: str | None = Field(default=None, max_length=300)
    sections: list[dict] | None = None
    is_active: bool | None = None
