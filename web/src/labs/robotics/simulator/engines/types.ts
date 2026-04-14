import type { RoboticsSimulatorBridge, SimulatorRobotModel } from "../types";

export type SimulatorEngineId = "three_runtime" | "grid_world" | "rapier";

export interface SimulatorEngineCreateOptions {
  engineId?: string | null;
  robotModel: SimulatorRobotModel;
}

export interface SimulatorEngineDescriptor {
  id: SimulatorEngineId;
  label: string;
  description: string;
}

export type SimulatorEngineFactory = (robotModel: SimulatorRobotModel) => RoboticsSimulatorBridge;

