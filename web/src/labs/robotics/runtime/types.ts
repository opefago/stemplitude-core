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
  semanticEvent?: RuntimeSemanticEvent;
}

export type RuntimeStepPolicy = "semantic_next" | "step_into" | "step_over";

export interface RuntimeStepOptions {
  simulation_budget_ms?: number;
  policy?: RuntimeStepPolicy;
}

export type RuntimeSemanticBoundaryType =
  | "node_executed"
  | "condition_evaluated"
  | "branch_selected"
  | "loop_check"
  | "loop_exit"
  | "call_enter"
  | "call_return"
  | "action_progress";

export interface RuntimeSemanticEvent {
  type: RuntimeSemanticBoundaryType;
  nodeId: string;
  detail?: string;
  callDepth: number;
  conditionResult?: boolean;
  variables?: Record<string, string | number | boolean>;
}

export interface RuntimeExecutor {
  load(program: RoboticsProgram): void;
  run(): void;
  pause(): void;
  reset(): void;
  step(input?: number | RuntimeStepOptions): RuntimeTickResult;
  getState(): RoboticsExecutionState;
}

export interface RuntimeTraceEntry {
  timestamp_ms: number;
  node_id: string;
  state: RoboticsExecutionState;
  sensor_snapshot: Record<string, unknown>;
}

