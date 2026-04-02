from app.curriculum.launcher_map import LAUNCHER_SLUGS, normalize_lab_launcher_id


def test_slug_passthrough():
    assert normalize_lab_launcher_id("circuit-maker") == "circuit-maker"
    assert normalize_lab_launcher_id("CIRCUIT-MAKER") == "circuit-maker"


def test_curriculum_types():
    assert normalize_lab_launcher_id("robotics_lab") == "micro-maker"
    assert normalize_lab_launcher_id("electronics_lab") == "circuit-maker"
    assert normalize_lab_launcher_id("python_lab") == "python-game"


def test_unknown_returns_none():
    assert normalize_lab_launcher_id("unknown_lab_xyz") is None
    assert normalize_lab_launcher_id("") is None
    assert normalize_lab_launcher_id(None) is None


def test_launcher_slugs_complete():
    assert "python-game" in LAUNCHER_SLUGS
