import type { RoboticsCapabilityManifest } from "../../../lib/robotics";

export type MotorBehaviorMode = "linear" | "turn" | "none";

export interface KitMotorBehavior {
  mode: MotorBehaviorMode;
  axisSign?: 1 | -1;
  maxSpeed?: number;
  defaultDurationSec?: number;
}

export interface KitRuntimeBehaviorProfile {
  maxLinearSpeedCmS: number;
  maxTurnSpeedDegS: number;
  motorBehaviors: Record<string, KitMotorBehavior>;
}

export interface ResolveKitRuntimeBehaviorInput {
  vendor: string;
  robotType: string;
  manifest?: RoboticsCapabilityManifest | null;
}

function keyOf(vendor: string, robotType: string) {
  return `${String(vendor || "").trim().toLowerCase()}:${String(robotType || "").trim().toLowerCase()}`;
}

function normalizeMotorBehaviors(
  source: Record<string, KitMotorBehavior> | null | undefined,
): Record<string, KitMotorBehavior> {
  const normalized: Record<string, KitMotorBehavior> = {};
  if (!source || typeof source !== "object") return normalized;
  for (const [motorId, behavior] of Object.entries(source)) {
    const key = String(motorId || "").trim().toLowerCase();
    if (!key) continue;
    normalized[key] = { ...behavior };
  }
  return normalized;
}

const DEFAULT_RUNTIME_BEHAVIOR: KitRuntimeBehaviorProfile = {
  maxLinearSpeedCmS: 25,
  maxTurnSpeedDegS: 120,
  motorBehaviors: {},
};

export class KitRuntimeBehaviorFactory {
  private kitProfiles = new Map<string, KitRuntimeBehaviorProfile>();

  registerKitBehavior(vendor: string, robotType: string, profile: KitRuntimeBehaviorProfile): this {
    this.kitProfiles.set(keyOf(vendor, robotType), {
      maxLinearSpeedCmS: Number(profile.maxLinearSpeedCmS) || DEFAULT_RUNTIME_BEHAVIOR.maxLinearSpeedCmS,
      maxTurnSpeedDegS: Number(profile.maxTurnSpeedDegS) || DEFAULT_RUNTIME_BEHAVIOR.maxTurnSpeedDegS,
      motorBehaviors: normalizeMotorBehaviors(profile.motorBehaviors),
    });
    return this;
  }

  resolve(input: ResolveKitRuntimeBehaviorInput): KitRuntimeBehaviorProfile {
    const fromRegistry = this.kitProfiles.get(keyOf(input.vendor, input.robotType));
    if (fromRegistry) {
      return {
        maxLinearSpeedCmS: fromRegistry.maxLinearSpeedCmS,
        maxTurnSpeedDegS: fromRegistry.maxTurnSpeedDegS,
        motorBehaviors: { ...fromRegistry.motorBehaviors },
      };
    }
    return {
      maxLinearSpeedCmS: DEFAULT_RUNTIME_BEHAVIOR.maxLinearSpeedCmS,
      maxTurnSpeedDegS: DEFAULT_RUNTIME_BEHAVIOR.maxTurnSpeedDegS,
      motorBehaviors: { ...DEFAULT_RUNTIME_BEHAVIOR.motorBehaviors },
    };
  }
}

const defaultFactory = new KitRuntimeBehaviorFactory();

export function registerKitRuntimeBehavior(vendor: string, robotType: string, profile: KitRuntimeBehaviorProfile) {
  defaultFactory.registerKitBehavior(vendor, robotType, profile);
}

export function resolveKitRuntimeBehavior(input: ResolveKitRuntimeBehaviorInput): KitRuntimeBehaviorProfile {
  return defaultFactory.resolve(input);
}

