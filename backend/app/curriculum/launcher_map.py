"""Map curriculum ``Lab.lab_type`` (and legacy slugs) to playground launcher route ids."""

from __future__ import annotations

# IDs used in web ``labRouting.LAB_ALIASES`` and heartbeat ``lab`` param.
LAUNCHER_SLUGS: frozenset[str] = frozenset(
    {
        "circuit-maker",
        "micro-maker",
        "robotics-lab",
        "python-game",
        "game-maker",
        "design-maker",
        "gamedev",
    }
)

# Curriculum / tenant_setting style names → launcher id
_CURRICULUM_TYPE_TO_LAUNCHER: dict[str, str] = {
    "electronics_lab": "circuit-maker",
    "access_electronics_lab": "circuit-maker",
    "robotics_lab": "micro-maker",
    "access_robotics_lab": "micro-maker",
    "robotics-lab": "robotics-lab",
    "robotics lab": "robotics-lab",
    "robotics_lab_vr": "robotics-lab",
    "robotics_vr": "robotics-lab",
    "stemplitude_robotics_lab": "robotics-lab",
    "game_maker": "game-maker",
    "access_game_maker": "game-maker",
    "design_maker": "design-maker",
    "access_design_maker": "design-maker",
    "3d_designer": "design-maker",
    "python_lab": "python-game",
    "access_python_lab": "python-game",
}


def normalize_lab_launcher_id(lab_type_or_slug: str | None) -> str | None:
    """Return playground launcher id, or None if unknown."""
    if not lab_type_or_slug:
        return None
    t = lab_type_or_slug.strip().lower()
    if not t:
        return None
    if t in LAUNCHER_SLUGS:
        return t
    return _CURRICULUM_TYPE_TO_LAUNCHER.get(t)
