import type { RoboticsExecutionState, RoboticsProgram } from "../../../lib/robotics";

export interface RuntimeTickResult {
  state: RoboticsExecutionState;
  highlightedNodeId?: string;
  diagnostics?: string[];
}

export interface RuntimeExecutor {
  load(program: RoboticsProgram): void;
  run(): void;
  pause(): void;
  reset(): void;
  step(): RuntimeTickResult;
  getState(): RoboticsExecutionState;
}

export interface RuntimeTraceEntry {
  timestamp_ms: number;
  node_id: string;
  state: RoboticsExecutionState;
  sensor_snapshot: Record<string, unknown>;
}

