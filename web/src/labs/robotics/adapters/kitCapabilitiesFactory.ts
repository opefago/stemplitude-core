import type { RoboticsCapabilityManifest } from "../../../lib/robotics";

type OverrideControlType = "none" | "number" | "boolean" | "select";

export interface SensorCapability {
  kind: string;
  label: string;
  override: {
    type: OverrideControlType;
    options?: string[];
  };
}

export interface ActuatorCapability {
  kind: string;
  label: string;
}

export interface KitCapabilities {
  sensors: SensorCapability[];
  actuators: ActuatorCapability[];
}

export interface ResolveKitCapabilitiesInput {
  vendor: string;
  robotType: string;
  manifest?: RoboticsCapabilityManifest | null;
}

interface RegisteredKitProfile {
  sensorKinds: string[];
  actuatorKinds: string[];
}

function toDisplayLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeKinds(values: unknown[]): string[] {
  return [...new Set(values.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean))];
}

function keyOf(vendor: string, robotType: string) {
  return `${String(vendor || "").trim().toLowerCase()}:${String(robotType || "").trim().toLowerCase()}`;
}

export class KitCapabilitiesFactory {
  private sensorRegistry = new Map<string, SensorCapability>();

  private actuatorRegistry = new Map<string, ActuatorCapability>();

  private kitProfiles = new Map<string, RegisteredKitProfile>();

  registerSensorCapability(capability: SensorCapability): this {
    const normalizedKind = String(capability.kind || "").trim().toLowerCase();
    if (!normalizedKind) return this;
    this.sensorRegistry.set(normalizedKind, {
      kind: normalizedKind,
      label: capability.label || toDisplayLabel(normalizedKind),
      override: capability.override || { type: "none" },
    });
    return this;
  }

  registerActuatorCapability(capability: ActuatorCapability): this {
    const normalizedKind = String(capability.kind || "").trim().toLowerCase();
    if (!normalizedKind) return this;
    this.actuatorRegistry.set(normalizedKind, {
      kind: normalizedKind,
      label: capability.label || toDisplayLabel(normalizedKind),
    });
    return this;
  }

  registerKit(vendor: string, robotType: string, profile: RegisteredKitProfile): this {
    this.kitProfiles.set(keyOf(vendor, robotType), {
      sensorKinds: normalizeKinds(profile.sensorKinds || []),
      actuatorKinds: normalizeKinds(profile.actuatorKinds || []),
    });
    return this;
  }

  resolve(input: ResolveKitCapabilitiesInput): KitCapabilities {
    const profile = this.kitProfiles.get(keyOf(input.vendor, input.robotType));
    const manifestSensorKinds = normalizeKinds(Array.isArray(input.manifest?.sensors) ? input.manifest.sensors : []);
    const manifestActuatorKinds = normalizeKinds(Array.isArray(input.manifest?.actuators) ? input.manifest.actuators : []);

    const sensorKinds = profile?.sensorKinds?.length
      ? profile.sensorKinds
      : manifestSensorKinds.length
        ? manifestSensorKinds
        : ["distance", "line", "color", "bumper", "gyro"];
    const actuatorKinds = profile?.actuatorKinds?.length
      ? profile.actuatorKinds
      : manifestActuatorKinds.length
        ? manifestActuatorKinds
        : ["left_motor", "right_motor", "arm_motor"];

    const sensors = sensorKinds.map((kind) => {
      const registered = this.sensorRegistry.get(kind);
      if (registered) return { ...registered, override: { ...registered.override } };
      return {
        kind,
        label: toDisplayLabel(kind),
        override: { type: "none" as OverrideControlType },
      };
    });

    const actuators = actuatorKinds.map((kind) => {
      const registered = this.actuatorRegistry.get(kind);
      if (registered) return { ...registered };
      return { kind, label: toDisplayLabel(kind) };
    });

    return { sensors, actuators };
  }
}

const defaultFactory = new KitCapabilitiesFactory();

// Baseline primitives available to all kit registrations.
defaultFactory
  .registerSensorCapability({
    kind: "distance",
    label: "Distance",
    override: { type: "number" },
  })
  .registerSensorCapability({
    kind: "line",
    label: "Line",
    override: { type: "boolean" },
  })
  .registerSensorCapability({
    kind: "color",
    label: "Color",
    override: { type: "select", options: ["default", "zone", "goal", "red", "green", "blue"] },
  })
  .registerSensorCapability({
    kind: "bumper",
    label: "Bumper",
    override: { type: "boolean" },
  })
  .registerSensorCapability({
    kind: "touch",
    label: "Touch",
    override: { type: "boolean" },
  })
  .registerSensorCapability({
    kind: "gyro",
    label: "Gyro",
    override: { type: "none" },
  })
  .registerActuatorCapability({ kind: "left_motor", label: "Left Motor" })
  .registerActuatorCapability({ kind: "right_motor", label: "Right Motor" })
  .registerActuatorCapability({ kind: "arm_motor", label: "Arm Motor" });

export function registerKitCapabilities(vendor: string, robotType: string, profile: RegisteredKitProfile) {
  defaultFactory.registerKit(vendor, robotType, profile);
}

export function registerSensorCapability(capability: SensorCapability) {
  defaultFactory.registerSensorCapability(capability);
}

export function registerActuatorCapability(capability: ActuatorCapability) {
  defaultFactory.registerActuatorCapability(capability);
}

export function resolveKitCapabilities(input: ResolveKitCapabilitiesInput): KitCapabilities {
  return defaultFactory.resolve(input);
}

