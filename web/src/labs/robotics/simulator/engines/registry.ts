import { GridWorldSimulator } from "../gridSimulator";
import { RapierRuntimeSimulator } from "../rapierRuntime";
import { ThreeRuntimeSimulator } from "../threeRuntime";
import type { RoboticsSimulatorBridge } from "../types";
import type {
  SimulatorEngineCreateOptions,
  SimulatorEngineDescriptor,
  SimulatorEngineFactory,
  SimulatorEngineId,
} from "./types";

const ENGINE_DESCRIPTORS: SimulatorEngineDescriptor[] = [
  {
    id: "three_runtime",
    label: "Three Runtime",
    description: "Primary 3D simulator with dynamic object interactions.",
  },
  {
    id: "grid_world",
    label: "Grid World",
    description: "Deterministic lightweight simulator for baseline checks.",
  },
  {
    id: "rapier",
    label: "Rapier",
    description: "Reserved adapter slot for production rigid-body engine integration.",
  },
];

const ENGINE_FACTORIES: Record<SimulatorEngineId, SimulatorEngineFactory> = {
  three_runtime: (robotModel) => new ThreeRuntimeSimulator(robotModel),
  grid_world: (robotModel) => new GridWorldSimulator(robotModel),
  rapier: (robotModel) => new RapierRuntimeSimulator(robotModel),
};

function normalizeEngineId(engineId: string | null | undefined): SimulatorEngineId {
  if (engineId === "grid_world") return "grid_world";
  if (engineId === "rapier") return "rapier";
  return "three_runtime";
}

export function listSimulatorEngines(): SimulatorEngineDescriptor[] {
  return ENGINE_DESCRIPTORS.slice();
}

export function createRoboticsSimulator(options: SimulatorEngineCreateOptions): RoboticsSimulatorBridge {
  const normalizedEngineId = normalizeEngineId(options.engineId);
  const factory = ENGINE_FACTORIES[normalizedEngineId] || ENGINE_FACTORIES.three_runtime;
  return factory(options.robotModel);
}

