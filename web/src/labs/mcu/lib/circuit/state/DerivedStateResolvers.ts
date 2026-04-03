import type { ComponentRuntimeState, BehaviorMode } from "../types/RuntimeState";
import { createDefaultRuntimeState } from "../types/RuntimeState";
import type { SimulationSnapshot } from "../types/SimulationSnapshot";
import type { ComponentLimits } from "../types/ComponentTypes";

type CompProps = Record<string, unknown>;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function resolveResistorState(
  componentId: string,
  props: CompProps,
  snapshot: SimulationSnapshot,
  limits?: ComponentLimits
): ComponentRuntimeState {
  const state = createDefaultRuntimeState();
  const voltage = (props.voltage as number) ?? 0;
  const current = (props.current as number) ?? 0;
  const burnt = (props.burnt as boolean) ?? false;
  const power = Math.abs(voltage * current);

  state.electrical = {
    terminalVoltages: snapshot.componentTerminalVoltages?.[componentId] ?? {},
    terminalCurrents: snapshot.componentTerminalCurrents?.[componentId] ?? {},
    voltageAcross: voltage,
    currentThrough: current,
    powerDissipation: power,
    conduction: burnt ? "non_conducting" : "conducting",
  };

  if (burnt) {
    state.stress.marginLevel = "critical";
    state.stress.overPower = true;
    state.behavior.mode = "damaged";
    state.visual.colorVariant = "danger";
    state.visual.glowLevel = 0;
    return state;
  }

  const maxPower = limits?.maxPower ?? (props.powerRating as number) ?? 0.25;
  const ratio = power / maxPower;
  if (ratio > 1.5) state.stress.marginLevel = "critical";
  else if (ratio > 1.0) state.stress.marginLevel = "danger";
  else if (ratio > 0.8) state.stress.marginLevel = "warning";
  else state.stress.marginLevel = "safe";

  state.stress.overPower = ratio > 1.0;

  state.visual.glowLevel = clamp(Math.abs(current) * 10, 0, 1);
  if (ratio > 1.0) state.visual.colorVariant = "danger";
  else if (ratio > 0.8) state.visual.colorVariant = "warning";
  else if (Math.abs(current) > 0.001) state.visual.colorVariant = "active";

  return state;
}

export function resolveCapacitorState(
  componentId: string,
  props: CompProps,
  snapshot: SimulationSnapshot,
  limits?: ComponentLimits
): ComponentRuntimeState {
  const state = createDefaultRuntimeState();
  const voltage = (props.voltage as number) ?? 0;
  const current = (props.current as number) ?? 0;
  const burnt = (props.burnt as boolean) ?? false;
  const voltageRating = limits?.maxVoltage ?? (props.voltageRating as number) ?? 25;

  state.electrical = {
    terminalVoltages: snapshot.componentTerminalVoltages?.[componentId] ?? {},
    terminalCurrents: snapshot.componentTerminalCurrents?.[componentId] ?? {},
    voltageAcross: voltage,
    currentThrough: current,
    powerDissipation: Math.abs(voltage * current),
    conduction: burnt ? "non_conducting" : undefined,
  };

  if (burnt) {
    state.stress.marginLevel = "critical";
    state.stress.overVoltage = true;
    state.behavior.mode = "damaged";
    state.visual.colorVariant = "danger";
    return state;
  }

  if (current > 0.001) state.behavior.mode = "charging";
  else if (current < -0.001) state.behavior.mode = "discharging";
  else state.behavior.mode = "idle";

  const vratio = Math.abs(voltage) / voltageRating;
  if (vratio > 1.0) {
    state.stress.marginLevel = "critical";
    state.stress.overVoltage = true;
  } else if (vratio > 0.9) {
    state.stress.marginLevel = "warning";
  }

  return state;
}

export function resolveInductorState(
  componentId: string,
  props: CompProps,
  snapshot: SimulationSnapshot,
  limits?: ComponentLimits
): ComponentRuntimeState {
  const state = createDefaultRuntimeState();
  const current = (props.current as number) ?? 0;
  const burnt = (props.burnt as boolean) ?? false;
  const maxCurrent = limits?.maxCurrent ?? (props.currentRating as number) ?? 1;

  state.electrical = {
    terminalVoltages: snapshot.componentTerminalVoltages?.[componentId] ?? {},
    terminalCurrents: snapshot.componentTerminalCurrents?.[componentId] ?? {},
    currentThrough: current,
    conduction: burnt ? "non_conducting" : undefined,
  };

  if (burnt) {
    state.stress.marginLevel = "critical";
    state.stress.overCurrent = true;
    state.behavior.mode = "damaged";
    state.visual.colorVariant = "danger";
    return state;
  }

  const iratio = Math.abs(current) / maxCurrent;
  if (iratio > 1.0) state.stress.marginLevel = "critical";
  else if (iratio > 0.9) state.stress.marginLevel = "warning";

  state.stress.overCurrent = iratio > 1.0;
  state.visual.glowLevel = clamp(iratio, 0, 1);

  return state;
}

export function resolveDiodeState(
  componentId: string,
  props: CompProps,
  snapshot: SimulationSnapshot,
  limits?: ComponentLimits
): ComponentRuntimeState {
  const state = createDefaultRuntimeState();
  const voltage = (props.voltage as number) ?? 0;
  const current = (props.current as number) ?? 0;
  const burnt = (props.burnt as boolean) ?? false;
  const isConducting = burnt ? false : ((props.isConducting as boolean) ?? false);
  const isForwardBiased = burnt ? false : ((props.isForwardBiased as boolean) ?? false);

  state.electrical = {
    terminalVoltages: snapshot.componentTerminalVoltages?.[componentId] ?? {},
    terminalCurrents: snapshot.componentTerminalCurrents?.[componentId] ?? {},
    voltageAcross: voltage,
    currentThrough: current,
    polarity: isForwardBiased ? "forward" : "reverse",
    conduction: burnt ? "non_conducting" : isConducting ? "conducting" : "non_conducting",
  };

  if (burnt) {
    state.stress.marginLevel = "critical";
    state.behavior.mode = "damaged";
    state.visual.colorVariant = "danger";
    state.visual.glowLevel = 0;
    return state;
  }

  state.behavior.mode = isConducting ? "active" : "cutoff";

  const maxReverse = limits?.maxReverseVoltage ?? 100;
  if (!isForwardBiased && Math.abs(voltage) > maxReverse) {
    state.stress.marginLevel = "critical";
    state.stress.reverseVoltage = true;
  }

  state.visual.glowLevel = isConducting ? clamp(current * 5, 0.2, 1) : 0;
  state.visual.colorVariant = isConducting ? "active" : "normal";

  return state;
}

export function resolveLedState(
  componentId: string,
  props: CompProps,
  snapshot: SimulationSnapshot,
  limits?: ComponentLimits
): ComponentRuntimeState {
  const state = resolveDiodeState(componentId, props, snapshot, limits);
  const burnt = (props.burnt as boolean) ?? false;
  const current = (props.current as number) ?? 0;
  const isConducting = burnt ? false : ((props.isConducting as boolean) ?? Math.abs(current) > 0.001);

  state.visual.glowing = isConducting;
  state.visual.glowLevel = isConducting ? clamp(current * 20, 0.1, 1) : 0;

  return state;
}

export function resolveBjtState(
  componentId: string,
  props: CompProps,
  snapshot: SimulationSnapshot,
  _limits?: ComponentLimits
): ComponentRuntimeState {
  const state = createDefaultRuntimeState();
  const isCutoff = (props.isCutoff as boolean) ?? false;
  const isActive = (props.isActive as boolean) ?? false;
  const isSaturated = (props.isSaturated as boolean) ?? false;
  const current = (props.current as number) ?? 0;

  let region: BehaviorMode = "unknown";
  if (isSaturated) region = "saturation";
  else if (isActive) region = "active";
  else if (isCutoff) region = "cutoff";

  state.electrical = {
    terminalVoltages: snapshot.componentTerminalVoltages?.[componentId] ?? {},
    terminalCurrents: snapshot.componentTerminalCurrents?.[componentId] ?? {},
    currentThrough: current,
    conduction: isCutoff ? "non_conducting" : "conducting",
  };

  state.behavior.mode = region;
  state.visual.glowLevel = region === "active" || region === "saturation"
    ? clamp(Math.abs(current) * 5, 0.1, 1)
    : 0;
  if (region === "saturation") state.visual.colorVariant = "warning";
  else if (region === "active") state.visual.colorVariant = "active";

  return state;
}

export function resolveMosfetState(
  componentId: string,
  props: CompProps,
  snapshot: SimulationSnapshot,
  _limits?: ComponentLimits
): ComponentRuntimeState {
  const state = createDefaultRuntimeState();
  const burnt = (props.burnt as boolean) ?? false;
  const isConducting = burnt ? false : ((props.isConducting as boolean) ?? false);
  const current = (props.current as number) ?? 0;

  state.electrical = {
    terminalVoltages: snapshot.componentTerminalVoltages?.[componentId] ?? {},
    terminalCurrents: snapshot.componentTerminalCurrents?.[componentId] ?? {},
    currentThrough: current,
    conduction: burnt ? "non_conducting" : isConducting ? "conducting" : "non_conducting",
  };

  if (burnt) {
    state.stress.marginLevel = "critical";
    state.behavior.mode = "damaged";
    state.visual.colorVariant = "danger";
    return state;
  }

  state.behavior.mode = isConducting ? "linear" : "cutoff";
  state.visual.glowLevel = isConducting ? clamp(Math.abs(current) * 5, 0.1, 1) : 0;

  return state;
}

export function resolveSwitchState(
  componentId: string,
  props: CompProps,
  snapshot: SimulationSnapshot,
  _limits?: ComponentLimits
): ComponentRuntimeState {
  const state = createDefaultRuntimeState();
  const isClosed = (props.isClosed as boolean) ?? false;
  const current = (props.current as number) ?? 0;

  state.electrical = {
    terminalVoltages: snapshot.componentTerminalVoltages?.[componentId] ?? {},
    terminalCurrents: snapshot.componentTerminalCurrents?.[componentId] ?? {},
    currentThrough: current,
  };

  state.behavior.mode = isClosed ? "closed" : "open";
  state.visual.colorVariant = isClosed && Math.abs(current) > 0.001 ? "active" : "normal";

  return state;
}

export function resolve555State(
  componentId: string,
  props: CompProps,
  snapshot: SimulationSnapshot,
  _limits?: ComponentLimits
): ComponentRuntimeState {
  const state = createDefaultRuntimeState();
  const outputHigh = (props.outputHigh as boolean) ?? false;
  const mode = (props.mode as string) ?? "astable";

  state.electrical = {
    terminalVoltages: snapshot.componentTerminalVoltages?.[componentId] ?? {},
    terminalCurrents: snapshot.componentTerminalCurrents?.[componentId] ?? {},
  };

  state.behavior.mode = mode === "astable" ? "oscillating" : outputHigh ? "high" : "low";
  state.visual.glowLevel = outputHigh ? 0.8 : 0;
  state.visual.colorVariant = outputHigh ? "active" : "normal";

  return state;
}

export function resolveRelayState(
  componentId: string,
  props: CompProps,
  snapshot: SimulationSnapshot,
  _limits?: ComponentLimits
): ComponentRuntimeState {
  const state = createDefaultRuntimeState();
  const isActivated = (props.isActivated as boolean) ?? false;

  state.electrical = {
    terminalVoltages: snapshot.componentTerminalVoltages?.[componentId] ?? {},
    terminalCurrents: snapshot.componentTerminalCurrents?.[componentId] ?? {},
  };

  state.behavior.mode = isActivated ? "closed" : "open";
  state.visual.colorVariant = isActivated ? "active" : "normal";

  return state;
}

/**
 * Resolves runtime state for any component based on its type.
 */
export function resolveComponentState(
  componentType: string,
  componentId: string,
  props: CompProps,
  snapshot: SimulationSnapshot,
  limits?: ComponentLimits
): ComponentRuntimeState {
  switch (componentType) {
    case "resistor":
      return resolveResistorState(componentId, props, snapshot, limits);
    case "capacitor":
      return resolveCapacitorState(componentId, props, snapshot, limits);
    case "inductor":
      return resolveInductorState(componentId, props, snapshot, limits);
    case "diode":
    case "zener_diode":
      return resolveDiodeState(componentId, props, snapshot, limits);
    case "led":
      return resolveLedState(componentId, props, snapshot, limits);
    case "npn_transistor":
    case "pnp_transistor":
      return resolveBjtState(componentId, props, snapshot, limits);
    case "nmos_transistor":
    case "pmos_transistor":
      return resolveMosfetState(componentId, props, snapshot, limits);
    case "switch":
    case "push_button":
      return resolveSwitchState(componentId, props, snapshot, limits);
    case "timer555":
      return resolve555State(componentId, props, snapshot, limits);
    case "relay":
      return resolveRelayState(componentId, props, snapshot, limits);
    default:
      return createDefaultRuntimeState();
  }
}
