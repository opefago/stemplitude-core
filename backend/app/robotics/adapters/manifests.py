"""Static capability manifests used during phase-0 scaffolding."""

from __future__ import annotations

from typing import Any


CAPABILITY_MANIFESTS: list[dict[str, Any]] = [
    {
        "vendor": "vex",
        "robot_type": "vex_vr",
        "display_name": "VEX VR",
        "languages": ["blocks", "python"],
        "simulation_support": "full",
        "deployment_support": "export_only",
        "sensors": ["distance", "line", "color", "bumper", "gyro"],
        "actuators": ["drive", "arm", "claw", "screen", "sound"],
        "constraints": {
            "max_motors": 8,
            "max_sensor_ports": 8,
            "roundtrip_text_to_blocks": False,
        },
    },
    {
        "vendor": "lego",
        "robot_type": "spike_prime",
        "display_name": "LEGO SPIKE Prime",
        "languages": ["blocks", "python"],
        "simulation_support": "partial",
        "deployment_support": "export_only",
        "sensors": ["distance", "color", "gyro", "force"],
        "actuators": ["drive", "hub_light", "speaker", "motor"],
        "constraints": {
            "max_motors": 6,
            "max_sensor_ports": 6,
            "roundtrip_text_to_blocks": False,
        },
    },
    {
        "vendor": "lego",
        "robot_type": "mindstorms_ev3",
        "display_name": "LEGO Mindstorms EV3",
        "languages": ["blocks", "python", "cpp"],
        "simulation_support": "partial",
        "deployment_support": "export_only",
        "sensors": ["distance", "color", "gyro", "touch"],
        "actuators": ["drive", "motor", "speaker", "led"],
        "constraints": {
            "max_motors": 4,
            "max_sensor_ports": 4,
            "roundtrip_text_to_blocks": False,
        },
    },
]

