import type { RoboticsCapabilityManifest } from "../../../lib/robotics";
import type { SimulatorRobotModel, SimulatorSensor } from "../simulator/types";

export interface KitSelection {
  vendor: string;
  robotType: string;
}

export interface ResolveRobotModelInput extends KitSelection {
  manifest?: RoboticsCapabilityManifest | null;
}

function sensorByKind(kind: string, id: string): SimulatorSensor {
  const normalizedKind = String(kind || "custom");
  if (normalizedKind === "distance") {
    return {
      id,
      kind: "distance",
      mount: { offset_cm: { x: 6, y: 0 }, heading_offset_deg: 0 },
      config: { max_range_cm: 250 },
    };
  }
  if (normalizedKind === "bumper" || normalizedKind === "touch") {
    return {
      id,
      kind: normalizedKind,
      mount: { offset_cm: { x: 7, y: 0 }, heading_offset_deg: 0 },
      config: {},
    };
  }
  if (normalizedKind === "line") {
    return {
      id,
      kind: "line",
      mount: { offset_cm: { x: 0, y: -2 }, heading_offset_deg: 0 },
      config: {},
    };
  }
  if (normalizedKind === "color") {
    return {
      id,
      kind: "color",
      mount: { offset_cm: { x: 0, y: 2 }, heading_offset_deg: 0 },
      config: {},
    };
  }
  if (normalizedKind === "gyro") {
    return {
      id,
      kind: "gyro",
      mount: { offset_cm: { x: 0, y: 0 }, heading_offset_deg: 0 },
      config: {},
    };
  }
  return {
    id,
    kind: "custom",
    mount: { offset_cm: { x: 0, y: 0 }, heading_offset_deg: 0 },
    config: {},
  };
}

function withDefaultSensors(sensors: SimulatorSensor[]): SimulatorSensor[] {
  if (sensors.some((sensor) => sensor.kind === "gyro")) return sensors;
  return [
    ...sensors,
    sensorByKind("gyro", "gyro"),
  ];
}

export function buildRobotModelFromManifest(manifest: RoboticsCapabilityManifest): SimulatorRobotModel {
  const rawSensors = Array.isArray(manifest.sensors) ? manifest.sensors : [];
  const sensors = rawSensors.map((sensorKind, index) => sensorByKind(String(sensorKind), String(sensorKind || `sensor_${index}`)));
  return {
    wheel_base_cm: 14,
    width_cm: 16,
    length_cm: 18,
    sensors: withDefaultSensors(sensors),
  };
}

export function getDefaultRobotModel(): SimulatorRobotModel {
  return {
    wheel_base_cm: 14,
    width_cm: 16,
    length_cm: 18,
    sensors: withDefaultSensors([
      sensorByKind("distance", "distance"),
      sensorByKind("line", "line"),
      sensorByKind("color", "color"),
      sensorByKind("bumper", "bumper"),
    ]),
  };
}

export function resolveRobotModel(input: ResolveRobotModelInput): SimulatorRobotModel {
  if (input.manifest) {
    return buildRobotModelFromManifest(input.manifest);
  }
  // Preserve deterministic fallback for known kit keys even before manifests load.
  if (input.vendor === "vex" && input.robotType === "vex_vr") {
    return getDefaultRobotModel();
  }
  return getDefaultRobotModel();
}
