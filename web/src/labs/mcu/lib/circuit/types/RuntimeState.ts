export type ElectricalState = {
  terminalVoltages: Record<string, number>;
  terminalCurrents: Record<string, number>;
  voltageAcross?: number;
  currentThrough?: number;
  powerDissipation?: number;
  polarity?: "forward" | "reverse" | "neutral" | "unknown";
  conduction?:
    | "conducting"
    | "non_conducting"
    | "breakdown"
    | "floating"
    | "unknown";
};

export type StressState = {
  reverseVoltage?: boolean;
  forwardVoltageExceeded?: boolean;
  overVoltage?: boolean;
  underVoltage?: boolean;
  overCurrent?: boolean;
  overPower?: boolean;
  overTemperature?: boolean;
  reverseCurrent?: boolean;
  avalancheOrBreakdown?: boolean;
  unstable?: boolean;
  marginLevel?: "safe" | "warning" | "danger" | "critical";
};

export type BehaviorMode =
  | "open"
  | "closed"
  | "charging"
  | "discharging"
  | "latched_high"
  | "latched_low"
  | "oscillating"
  | "cutoff"
  | "active"
  | "saturation"
  | "reverse_active"
  | "triode"
  | "linear"
  | "breakdown"
  | "idle"
  | "spinning"
  | "buzzing"
  | "high"
  | "low"
  | "floating"
  | "unknown";

export type BehaviorState = {
  mode?: BehaviorMode;
  frequencyHz?: number;
  dutyCycle?: number;
  phase?: number;
};

export type ThermalState = {
  temperatureC?: number;
  ambientC?: number;
  heatingRate?: number;
  coolingRate?: number;
  thermalMargin?: number;
};

export type DamageType =
  | "none"
  | "burned_out"
  | "shorted"
  | "opened"
  | "degraded"
  | "thermal_failure"
  | "reverse_polarity_failure"
  | "overvoltage_failure"
  | "overcurrent_failure"
  | "breakdown_failure";

export type FailureMode = "open" | "short" | "degraded" | "intermittent";

export type DamageState = {
  damaged: boolean;
  damageLevel?: 0 | 1 | 2 | 3;
  damageType?: DamageType;
  reversible?: boolean;
  functional?: boolean;
  failureMode?: FailureMode;
};

export type AnimationType =
  | "none"
  | "pulse"
  | "flicker"
  | "flow"
  | "spark"
  | "smoke"
  | "flash";

export type ColorVariant =
  | "normal"
  | "active"
  | "warning"
  | "danger"
  | "damaged";

export type VisualState = {
  highlighted?: boolean;
  selected?: boolean;
  glowing?: boolean;
  glowLevel?: number;
  colorVariant?: ColorVariant;
  animation?: AnimationType;
  badges?: string[];
  visibleLabelHints?: string[];
};

export type ComponentRuntimeState = {
  electrical: ElectricalState;
  stress: StressState;
  behavior: BehaviorState;
  thermal?: ThermalState;
  damage: DamageState;
  visual: VisualState;
};

export type ComponentInstanceState = {
  userState: Record<string, unknown>;
  persistentState: {
    damage?: DamageState;
    degradation?: number;
  };
  derivedState: ComponentRuntimeState;
};

export function createDefaultRuntimeState(): ComponentRuntimeState {
  return {
    electrical: {
      terminalVoltages: {},
      terminalCurrents: {},
    },
    stress: {
      marginLevel: "safe",
    },
    behavior: {
      mode: "unknown",
    },
    damage: {
      damaged: false,
      damageLevel: 0,
      damageType: "none",
      functional: true,
    },
    visual: {},
  };
}
