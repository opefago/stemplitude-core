"""Franchise / district hierarchy: how parent curriculum, assets, and brand relate to a child tenant."""

from __future__ import annotations

from uuid import UUID

# Who drives curriculum, shared libraries, brand, and parent-facing rollups for a child site.
GOVERNANCE_MODES: frozenset[str] = frozenset(
    {
        "child_managed",  # Child authors curriculum & brand; no parent catalog in child UI.
        "parent_managed",  # Parent's curriculum + asset library + brand are authoritative; child does not author curriculum.
        "hybrid",  # Child may author; parent catalog/libraries also visible (shared responsibility).
        "isolated",  # Franchise link for ops/billing only: no parent content, brand, or rollups in child experience.
    }
)
DEFAULT_GOVERNANCE_MODE = "child_managed"


def normalize_governance_mode(raw: str | None) -> str:
    m = (raw or DEFAULT_GOVERNANCE_MODE).strip().lower()
    return m if m in GOVERNANCE_MODES else DEFAULT_GOVERNANCE_MODE


def expanded_governance_flags(mode: str) -> dict:
    """Canonical boolean flags stored in ``tenant_hierarchy.governance`` JSON (and used by services)."""
    m = normalize_governance_mode(mode)
    if m == "child_managed":
        return {
            "mode": m,
            "share_parent_curriculum": False,
            "child_may_author_curriculum": True,
            "include_parent_asset_library": False,
            "brand_source": "child",
            "parent_analytics_rollups": True,
        }
    if m == "parent_managed":
        return {
            "mode": m,
            "share_parent_curriculum": True,
            "child_may_author_curriculum": False,
            "include_parent_asset_library": True,
            "brand_source": "parent",
            "parent_analytics_rollups": True,
        }
    if m == "hybrid":
        return {
            "mode": m,
            "share_parent_curriculum": True,
            "child_may_author_curriculum": True,
            "include_parent_asset_library": True,
            "brand_source": "hybrid",
            "parent_analytics_rollups": True,
        }
    # isolated
    return {
        "mode": m,
        "share_parent_curriculum": False,
        "child_may_author_curriculum": True,
        "include_parent_asset_library": False,
        "brand_source": "child",
        "parent_analytics_rollups": False,
    }


def merge_governance_dict(base: dict, overrides: dict | None) -> dict:
    """Apply optional JSON overrides (e.g. flip rollups) without changing stored ``governance_mode``."""
    if not overrides:
        return dict(base)
    out = dict(base)
    for k, v in overrides.items():
        if k == "mode":
            continue
        out[k] = v
    return out


def build_stored_governance(governance_mode: str, overrides: dict | None) -> dict:
    base = expanded_governance_flags(governance_mode)
    return merge_governance_dict(base, overrides)


def curriculum_read_tenant_ids(
    *, child_tenant_id: UUID, parent_tenant_id: UUID | None, governance_mode: str | None
) -> list[UUID]:
    """Tenant IDs whose published curriculum should appear in the child workspace."""
    if not parent_tenant_id:
        return [child_tenant_id]
    m = normalize_governance_mode(governance_mode)
    if m == "parent_managed":
        return [parent_tenant_id]
    if m == "hybrid":
        return [child_tenant_id, parent_tenant_id]
    return [child_tenant_id]


def asset_library_read_tenant_ids(
    *, child_tenant_id: UUID, parent_tenant_id: UUID | None, governance_mode: str | None
) -> list[UUID]:
    """Tenant IDs merged for asset library listing in the child workspace."""
    return curriculum_read_tenant_ids(
        child_tenant_id=child_tenant_id,
        parent_tenant_id=parent_tenant_id,
        governance_mode=governance_mode,
    )


def child_may_author_curriculum(governance_mode: str | None) -> bool:
    return expanded_governance_flags(governance_mode)["child_may_author_curriculum"]


def parent_analytics_rollups_allowed(
    governance_mode: str | None, governance_json: dict | None
) -> bool:
    """Explicit ``parent_analytics_rollups: false`` in JSON overrides mode defaults."""
    if governance_json and "parent_analytics_rollups" in governance_json:
        return bool(governance_json.get("parent_analytics_rollups"))
    return bool(expanded_governance_flags(governance_mode).get("parent_analytics_rollups"))


def brand_settings_for_child_ui(
    *,
    governance_mode: str | None,
    child_settings: dict | None,
    parent_settings: dict | None,
) -> dict | None:
    """Merge ``tenant.settings`` for student UI (``settings[\"ui\"]``) per franchise brand policy."""
    src = expanded_governance_flags(governance_mode).get("brand_source") or "child"
    c = child_settings if isinstance(child_settings, dict) else {}
    p = parent_settings if isinstance(parent_settings, dict) else {}
    if src == "parent":
        out = dict(c)
        p_ui = p.get("ui") if isinstance(p.get("ui"), dict) else {}
        out["ui"] = dict(p_ui)
        return out
    if src == "hybrid":
        out = dict(c)
        p_ui = p.get("ui") if isinstance(p.get("ui"), dict) else {}
        c_ui = c.get("ui") if isinstance(c.get("ui"), dict) else {}
        out["ui"] = {**p_ui, **c_ui}
        return out
    return c or None
