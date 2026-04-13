import type { RoboticsExecutionState, RoboticsProgram } from "../../../lib/robotics";
import type { IssueCategory, IssueCode, IssueSeverity } from "./issueCodes";

export interface RuntimeIssue {
  code: IssueCode;
  severity: IssueSeverity;
  category: IssueCategory;
  message: string;
  line?: number;
}

export interface RuntimeTickResult {
  state: RoboticsExecutionState;
  highlightedNodeId?: string;
  diagnostics?: string[];
  issues: RuntimeIssue[];
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

