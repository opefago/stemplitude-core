import type { ComponentRuntimeState, StressState, DamageState, DamageType } from "../types/RuntimeState";
import type { ComponentLimits } from "../types/ComponentTypes";

export type StressLevel = "safe" | "warning" | "danger" | "critical" | "damaged" | "failed";

export type StressAccumulator = {
  componentId: string;
  cumulativeStressSeconds: number;
  thermalEnergy: number;
  lastStressLevel: StressLevel;
  damageProgression: number; // 0.0 = pristine, 1.0 = fully failed
};

const STRESS_THRESHOLDS = {
  warningToSafe: 5, // seconds of continuous warning before it decays
  dangerToDamage: 3, // seconds of continuous danger before damage starts
  criticalToDamage: 0.5, // seconds of critical before damage starts
  damageToFailure: 2, // seconds of accumulated damage before failure
} as const;

export function createStressAccumulator(componentId: string): StressAccumulator {
  return {
    componentId,
    cumulativeStressSeconds: 0,
    thermalEnergy: 0,
    lastStressLevel: "safe",
    damageProgression: 0,
  };
}

/**
 * Evaluate stress from circuit properties against component limits.
 */
export function evaluateStress(
  voltage: number,
  current: number,
  power: number,
  limits: ComponentLimits,
  existing?: Partial<StressState>
): StressState {
  const stress: StressState = {
    marginLevel: "safe",
    ...existing,
  };

  if (limits.maxVoltage !== undefined) {
    const ratio = Math.abs(voltage) / limits.maxVoltage;
    if (ratio > 1.5) stress.marginLevel = "critical";
    else if (ratio > 1.0) {
      stress.overVoltage = true;
      if (stress.marginLevel !== "critical") stress.marginLevel = "danger";
    } else if (ratio > 0.8) {
      if (stress.marginLevel === "safe") stress.marginLevel = "warning";
    }
  }

  if (limits.maxCurrent !== undefined) {
    const ratio = Math.abs(current) / limits.maxCurrent;
    if (ratio > 2.0) stress.marginLevel = "critical";
    else if (ratio > 1.0) {
      stress.overCurrent = true;
      if (stress.marginLevel !== "critical") stress.marginLevel = "danger";
    } else if (ratio > 0.8) {
      if (stress.marginLevel === "safe") stress.marginLevel = "warning";
    }
  }

  if (limits.maxPower !== undefined) {
    const ratio = power / limits.maxPower;
    if (ratio > 2.0) stress.marginLevel = "critical";
    else if (ratio > 1.0) {
      stress.overPower = true;
      if (stress.marginLevel !== "critical") stress.marginLevel = "danger";
    } else if (ratio > 0.8) {
      if (stress.marginLevel === "safe") stress.marginLevel = "warning";
    }
  }

  if (limits.maxReverseVoltage !== undefined && voltage < 0) {
    if (Math.abs(voltage) > limits.maxReverseVoltage) {
      stress.reverseVoltage = true;
      stress.marginLevel = "critical";
    }
  }

  return stress;
}

/**
 * Progressively accumulate damage based on stress duration.
 * Returns the updated accumulator and damage state.
 */
export function progressDamage(
  accumulator: StressAccumulator,
  stressLevel: StressLevel,
  deltaTimeSeconds: number,
  realisticMode: boolean
): { accumulator: StressAccumulator; damage: DamageState } {
  const acc = { ...accumulator };
  const damage: DamageState = {
    damaged: false,
    damageLevel: 0,
    damageType: "none",
    functional: true,
  };

  if (!realisticMode) {
    // Safe-learning mode: no permanent damage
    acc.lastStressLevel = stressLevel;
    return { accumulator: acc, damage };
  }

  switch (stressLevel) {
    case "safe":
      // Slowly recover stress accumulation
      acc.cumulativeStressSeconds = Math.max(
        0,
        acc.cumulativeStressSeconds - deltaTimeSeconds * 0.5
      );
      acc.thermalEnergy = Math.max(0, acc.thermalEnergy - deltaTimeSeconds * 0.2);
      break;
    case "warning":
      acc.cumulativeStressSeconds += deltaTimeSeconds * 0.3;
      break;
    case "danger":
      acc.cumulativeStressSeconds += deltaTimeSeconds;
      acc.thermalEnergy += deltaTimeSeconds * 0.5;
      break;
    case "critical":
      acc.cumulativeStressSeconds += deltaTimeSeconds * 3;
      acc.thermalEnergy += deltaTimeSeconds * 2;
      break;
  }

  // Compute damage progression
  if (acc.cumulativeStressSeconds > STRESS_THRESHOLDS.criticalToDamage && stressLevel === "critical") {
    acc.damageProgression += deltaTimeSeconds * 0.5;
  } else if (acc.cumulativeStressSeconds > STRESS_THRESHOLDS.dangerToDamage && stressLevel === "danger") {
    acc.damageProgression += deltaTimeSeconds * 0.1;
  }

  acc.damageProgression = Math.min(acc.damageProgression, 1.0);
  acc.lastStressLevel = stressLevel;

  if (acc.damageProgression > 0.9) {
    damage.damaged = true;
    damage.damageLevel = 3;
    damage.damageType = determineDamageType(stressLevel);
    damage.functional = false;
    damage.failureMode = "open";
  } else if (acc.damageProgression > 0.5) {
    damage.damaged = true;
    damage.damageLevel = 2;
    damage.damageType = "degraded";
    damage.functional = true;
  } else if (acc.damageProgression > 0.2) {
    damage.damaged = true;
    damage.damageLevel = 1;
    damage.damageType = "degraded";
    damage.functional = true;
    damage.reversible = true;
  }

  return { accumulator: acc, damage };
}

function determineDamageType(stressLevel: StressLevel): DamageType {
  switch (stressLevel) {
    case "critical":
      return "burned_out";
    case "danger":
      return "thermal_failure";
    default:
      return "degraded";
  }
}

/**
 * Apply stress evaluation to a runtime state in-place.
 */
export function applyStressToRuntimeState(
  state: ComponentRuntimeState,
  voltage: number,
  current: number,
  limits: ComponentLimits
): void {
  const power = Math.abs(voltage * current);
  const stress = evaluateStress(voltage, current, power, limits, state.stress);
  state.stress = stress;

  if (stress.marginLevel === "critical") {
    state.visual.colorVariant = "danger";
    state.visual.badges = [...(state.visual.badges ?? []), "overstress"];
  } else if (stress.marginLevel === "danger") {
    state.visual.colorVariant = "danger";
  } else if (stress.marginLevel === "warning") {
    state.visual.colorVariant = "warning";
  }
}
