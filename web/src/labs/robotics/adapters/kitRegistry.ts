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

function withWheelDefaults(model: SimulatorRobotModel): SimulatorRobotModel {
  return {
    ...model,
    wheel_radius_cm: model.wheel_radius_cm ?? 3.4,
    wheel_width_cm: model.wheel_width_cm ?? 2.2,
    track_width_cm: model.track_width_cm ?? Math.max(8, model.width_cm * 0.85),
    wheelbase_cm: model.wheelbase_cm ?? model.wheel_base_cm ?? Math.max(8, model.length_cm * 0.72),
    traction_longitudinal: model.traction_longitudinal ?? 0.92,
    traction_lateral: model.traction_lateral ?? 0.9,
    rolling_resistance: model.rolling_resistance ?? 4.2,
    max_wheel_accel_cm_s2: model.max_wheel_accel_cm_s2 ?? 140,
  };
}

export function buildRobotModelFromManifest(manifest: RoboticsCapabilityManifest): SimulatorRobotModel {
  const rawSensors = Array.isArray(manifest.sensors) ? manifest.sensors : [];
  const sensors = rawSensors.map((sensorKind, index) => sensorByKind(String(sensorKind), String(sensorKind || `sensor_${index}`)));
  return withWheelDefaults({
    wheel_base_cm: 14,
    width_cm: 16,
    length_cm: 18,
    sensors: withDefaultSensors(sensors),
  });
}

export function getDefaultRobotModel(): SimulatorRobotModel {
  return withWheelDefaults({
    wheel_base_cm: 14,
    width_cm: 16,
    length_cm: 18,
    sensors: withDefaultSensors([
      sensorByKind("distance", "distance"),
      sensorByKind("line", "line"),
      sensorByKind("color", "color"),
      sensorByKind("bumper", "bumper"),
    ]),
  });
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
