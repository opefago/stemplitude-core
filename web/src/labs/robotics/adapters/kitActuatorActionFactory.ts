import type { RoboticsCapabilityManifest } from "../../../lib/robotics";
import type { RoboticsSimulatorBridge } from "../simulator/types";
import type { KitRuntimeBehaviorProfile } from "./kitRuntimeBehaviorFactory";

export interface ActuatorActionRequest {
  actuatorId: string;
  action: string;
  speedPct?: number;
  durationSec?: number;
  value?: string | number | boolean;
}

export interface ActuatorActionContext {
  simulator: RoboticsSimulatorBridge;
  runtimeBehavior: KitRuntimeBehaviorProfile;
  tickForDuration: (totalMs: number, linearVelocityCmS: number, angularVelocityDegS: number) => void;
}

export interface ActuatorActionResult {
  handled: boolean;
  diagnostics?: string[];
}

export type KitActuatorActionHandler = (
  request: ActuatorActionRequest,
  context: ActuatorActionContext,
) => ActuatorActionResult | void;

export interface ResolveKitActuatorActionHandlerInput {
  vendor: string;
  robotType: string;
  actuatorId: string;
  action: string;
  manifest?: RoboticsCapabilityManifest | null;
}

function keyOf(vendor: string, robotType: string) {
  return `${String(vendor || "").trim().toLowerCase()}:${String(robotType || "").trim().toLowerCase()}`;
}

function actionKey(actuatorId: string, action: string) {
  return `${String(actuatorId || "").trim().toLowerCase()}:${String(action || "").trim().toLowerCase()}`;
}

export class KitActuatorActionFactory {
  private handlers = new Map<string, Map<string, KitActuatorActionHandler>>();

  registerKitActuatorAction(
    vendor: string,
    robotType: string,
    actuatorId: string,
    action: string,
    handler: KitActuatorActionHandler,
  ): this {
    const kitKey = keyOf(vendor, robotType);
    const next = this.handlers.get(kitKey) || new Map<string, KitActuatorActionHandler>();
    next.set(actionKey(actuatorId, action), handler);
    this.handlers.set(kitKey, next);
    return this;
  }

  resolve(input: ResolveKitActuatorActionHandlerInput): KitActuatorActionHandler | null {
    const byKit = this.handlers.get(keyOf(input.vendor, input.robotType));
    if (!byKit) return null;
    return byKit.get(actionKey(input.actuatorId, input.action)) || null;
  }
}

const defaultFactory = new KitActuatorActionFactory();

export function registerKitActuatorAction(
  vendor: string,
  robotType: string,
  actuatorId: string,
  action: string,
  handler: KitActuatorActionHandler,
) {
  defaultFactory.registerKitActuatorAction(vendor, robotType, actuatorId, action, handler);
}

export function resolveKitActuatorActionHandler(
  input: ResolveKitActuatorActionHandlerInput,
): KitActuatorActionHandler | null {
  return defaultFactory.resolve(input);
}

