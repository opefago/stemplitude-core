import type {
  RoboticsCondition,
  RoboticsExpression,
  RoboticsIRNode,
  RoboticsProgram,
} from "../../../lib/robotics";
import type { KitActuatorActionHandler } from "../adapters/kitActuatorActionFactory";
import type { KitRuntimeBehaviorProfile } from "../adapters/kitRuntimeBehaviorFactory";
import type { RoboticsSimulatorBridge } from "../simulator/types";
import { ISSUE_CODES } from "./issueCodes";
import type { IssueCode } from "./issueCodes";
import {
  DEFAULT_PHYSICS_STEP_MS,
  type ActiveDistanceMoveState,
  type ActiveTurnMoveState,
  type MoveCollisionPolicy,
  RuntimePhysicsEngine,
} from "./physicsEngine";
import type {
  RuntimeExecutor,
  RuntimeIssue,
  RuntimeSemanticEvent,
  RuntimeStepOptions,
  RuntimeStepPolicy,
  RuntimeTickResult,
  RuntimeTraceEntry,
} from "./types";

type RuntimeValue = string | number | boolean;

interface CallFrame {
  frameId: string;
  functionId: string;
  vars: Map<string, RuntimeValue>;
  didReturn: boolean;
  returnValue: RuntimeValue;
}

interface RuntimeExecutionOptions {
  moveCollisionPolicy?: MoveCollisionPolicy;
}

interface PendingNodeEntry {
  kind: "node";
  node: RoboticsIRNode;
  ownerCallFrameId?: string;
}

interface PendingCallEndEntry {
  kind: "call_end";
  callFrameId: string;
  nodeId: string;
}

type PendingExecutionEntry = PendingNodeEntry | PendingCallEndEntry;

interface StepOverTarget {
  kind: "call" | "loop";
  baseNodeId: string;
  startCallDepth: number;
}

function computeTurnCreepLinearCmS(
  maxLinearSpeedCmS: number,
  speedPct: number,
): number {
  const normalized = Math.max(0, Math.min(100, Number(speedPct) || 0)) / 100;
  const target = maxLinearSpeedCmS * 0.18 * normalized;
  return Math.max(4, Math.min(14, target));
}

function toDistanceCm(unit: string, value: number): number {
  if (unit === "distance_mm") return value / 10;
  if (unit === "distance_in") return value * 2.54;
  return value;
}

function baseNodeId(nodeId?: string): string {
  if (!nodeId) return "";
  const markerIndex = nodeId.indexOf("__q");
  return markerIndex >= 0 ? nodeId.slice(0, markerIndex) : nodeId;
}

interface RuntimeCollector {
  diagnostics: string[];
  issues: RuntimeIssue[];
}

function reportRuntimeIssue(
  collector: RuntimeCollector,
  code: IssueCode,
  message: string,
  severity: RuntimeIssue["severity"] = "error",
) {
  collector.diagnostics.push(message);
  collector.issues.push({
    code,
    severity,
    category: "runtime",
    message,
  });
}

export class IRRuntimeExecutor implements RuntimeExecutor {
  private program: RoboticsProgram | null = null;
  private cursor = 0;
  private state: "idle" | "running" | "paused" | "completed" | "error" = "idle";
  private globalVariables = new Map<string, RuntimeValue>();
  private callFrames: CallFrame[] = [];
  private trace: RuntimeTraceEntry[] = [];
  private callDepth = 0;
  private activeDistanceMove: ActiveDistanceMoveState | null = null;
  private activeTurnMove: ActiveTurnMoveState | null = null;
  private physicsEngine: RuntimePhysicsEngine;
  private pendingNodes: PendingExecutionEntry[] = [];
  private repeatWhileGuards = new Map<string, number>();
  private queueSequence = 0;
  private callFrameSequence = 0;
  private currentStepPolicy: RuntimeStepPolicy = "semantic_next";
  private stepOverTarget: StepOverTarget | null = null;

  private static readonly MAX_CALL_DEPTH = 32;

  constructor(
    private simulator: RoboticsSimulatorBridge,
    private runtimeBehavior: KitRuntimeBehaviorProfile = {
      maxLinearSpeedCmS: 25,
      maxTurnSpeedDegS: 120,
      motorBehaviors: {},
    },
    private resolveActuatorAction:
      | ((
          actuatorId: string,
          action: string,
        ) => KitActuatorActionHandler | null)
      | null = null,
    private executionOptions: RuntimeExecutionOptions = {},
  ) {
    this.physicsEngine = new RuntimePhysicsEngine(simulator, {
      fixedStepMs: DEFAULT_PHYSICS_STEP_MS,
    });
  }

  load(program: RoboticsProgram): void {
    this.program = cloneProgram(program);
    this.cursor = 0;
    this.state = "idle";
    this.globalVariables.clear();
    this.callFrames = [];
    this.trace = [];
    this.activeDistanceMove = null;
    this.activeTurnMove = null;
    this.pendingNodes = [];
    this.repeatWhileGuards.clear();
    this.queueSequence = 0;
    this.callFrameSequence = 0;
    this.stepOverTarget = null;
  }

  run(): void {
    if (!this.program) return;
    if (this.state === "completed") {
      this.cursor = 0;
    }
    this.state = "running";
  }

  pause(): void {
    if (this.state === "running") {
      this.state = "paused";
    }
  }

  reset(): void {
    this.cursor = 0;
    this.state = "idle";
    this.globalVariables.clear();
    this.callFrames = [];
    this.trace = [];
    this.callDepth = 0;
    this.activeDistanceMove = null;
    this.activeTurnMove = null;
    this.pendingNodes = [];
    this.repeatWhileGuards.clear();
    this.queueSequence = 0;
    this.callFrameSequence = 0;
    this.stepOverTarget = null;
  }

  getState(): "idle" | "running" | "paused" | "completed" | "error" {
    return this.state;
  }

  getTrace(): RuntimeTraceEntry[] {
    return this.trace.slice();
  }

  step(input?: number | RuntimeStepOptions): RuntimeTickResult {
    const { simulationBudgetMs, policy } = this.resolveStepInput(input);
    this.currentStepPolicy = policy;
    if (policy !== "step_over") {
      this.stepOverTarget = null;
    }
    if (!this.program) {
      this.state = "error";
      const collector: RuntimeCollector = { diagnostics: [], issues: [] };
      reportRuntimeIssue(
        collector,
        ISSUE_CODES.RUNTIME_DIAGNOSTIC,
        "No program loaded",
      );
      return {
        state: this.state,
        diagnostics: collector.diagnostics,
        issues: collector.issues,
      };
    }
    if (this.state === "idle" || this.state === "paused") {
      this.state = "running";
    }
    if (policy === "step_over") {
      return this.stepOver(simulationBudgetMs);
    }
    return this.stepToBoundary(simulationBudgetMs);
  }

  private resolveStepInput(input?: number | RuntimeStepOptions): {
    simulationBudgetMs: number;
    policy: RuntimeStepPolicy;
  } {
    if (typeof input === "number" || input === undefined) {
      return {
        simulationBudgetMs: Math.max(
          this.physicsEngine.getFixedStepMs(),
          Number(input) || 200,
        ),
        policy: "semantic_next",
      };
    }
    const rawBudget = Number(input.simulation_budget_ms);
    return {
      simulationBudgetMs: Math.max(
        this.physicsEngine.getFixedStepMs(),
        Number.isFinite(rawBudget) ? rawBudget : 200,
      ),
      policy: input.policy || "semantic_next",
    };
  }

  private stepOver(simulationBudgetMs: number): RuntimeTickResult {
    const result = this.stepToBoundary(simulationBudgetMs);
    const event = result.semanticEvent;
    if (!event) return result;
    const eventBaseNodeId = baseNodeId(event.nodeId);

    if (!this.stepOverTarget) {
      if (event.type === "call_enter") {
        this.stepOverTarget = {
          kind: "call",
          baseNodeId: eventBaseNodeId,
          startCallDepth: event.callDepth,
        };
      } else if (
        event.type === "loop_check" ||
        event.type === "condition_evaluated" ||
        event.type === "branch_selected"
      ) {
        this.stepOverTarget = {
          kind: "loop",
          baseNodeId: eventBaseNodeId,
          startCallDepth: event.callDepth,
        };
      }
      if (result.state !== "running") {
        this.stepOverTarget = null;
      }
      return result;
    }

    if (
      this.stepOverTarget.kind === "call" &&
      event.type === "call_return" &&
      event.callDepth < this.stepOverTarget.startCallDepth
    ) {
      this.stepOverTarget = null;
    } else if (
      this.stepOverTarget.kind === "loop" &&
      event.type === "loop_exit" &&
      eventBaseNodeId === this.stepOverTarget.baseNodeId
    ) {
      this.stepOverTarget = null;
    } else if (result.state !== "running") {
      this.stepOverTarget = null;
    }

    return result;
  }

  private stepToBoundary(simulationBudgetMs: number): RuntimeTickResult {
    let guard = 0;
    while (guard < 5000) {
      guard += 1;
      if (
        this.cursor >= (this.program?.nodes.length || 0) &&
        this.pendingNodes.length === 0
      ) {
        this.state = "completed";
        return { state: this.state, issues: [] };
      }
      const next = this.peekNextEntry();
      if (!next) {
        this.state = "completed";
        return { state: this.state, issues: [] };
      }
      const collector: RuntimeCollector = { diagnostics: [], issues: [] };
      const currentIsQueued = this.pendingNodes.length > 0;
      if (next.kind === "call_end") {
        this.consumeNextEntry();
        this.popCallFrame(next.callFrameId);
        const event = this.buildSemanticEvent(
          "call_return",
          next.nodeId,
          `return:${next.callFrameId}`,
        );
        this.pushTrace(next.nodeId);
        this.markCompletedIfDone();
        return {
          state: this.state,
          highlightedNodeId: next.nodeId,
          diagnostics: collector.diagnostics,
          issues: collector.issues,
          semanticEvent: event,
        };
      }
      const node = next.node;
      if (
        next.ownerCallFrameId &&
        this.isCallFrameReturned(next.ownerCallFrameId)
      ) {
        this.consumeNextEntry();
        continue;
      }
      if (node.kind === "if" || node.kind === "repeat") {
        if (currentIsQueued) {
          this.pendingNodes.shift();
        } else {
          this.cursor += 1;
        }
        if (this.tryExpandControlNode(node, collector, next.ownerCallFrameId)) {
          this.pushTrace(node.id);
          const event = this.buildControlBoundaryEvent(node);
          this.markCompletedIfDone();
          return {
            state: this.state,
            highlightedNodeId: node.id,
            diagnostics: collector.diagnostics,
            issues: collector.issues,
            semanticEvent: event,
          };
        }
      }
      if (node.kind === "call") {
        if (currentIsQueued) {
          this.pendingNodes.shift();
        } else {
          this.cursor += 1;
        }
        const callEvent = this.scheduleFunctionCall(
          node,
          collector,
          next.ownerCallFrameId,
        );
        this.pushTrace(node.id);
        this.markCompletedIfDone();
        return {
          state: this.state,
          highlightedNodeId: node.id,
          diagnostics: collector.diagnostics,
          issues: collector.issues,
          semanticEvent: callEvent,
        };
      }

      let completedNode = true;
      if (node.kind === "move" && node.unit !== "seconds") {
        completedNode = this.executeTopLevelDistanceMove(
          node,
          collector,
          simulationBudgetMs,
        );
      } else if (node.kind === "turn") {
        completedNode = this.executeTopLevelTurn(node, simulationBudgetMs);
      } else {
        this.activeDistanceMove = null;
        this.activeTurnMove = null;
        this.executeNode(node, collector);
      }
      this.pushTrace(node.id);
      if (completedNode) {
        this.consumeNextEntry();
      }
      this.markCompletedIfDone();
      return {
        state: this.state,
        highlightedNodeId: node.id,
        diagnostics: collector.diagnostics,
        issues: collector.issues,
        semanticEvent: this.buildSemanticEvent(
          completedNode ? "node_executed" : "action_progress",
          node.id,
        ),
      };
    }
    this.state = "error";
    return {
      state: this.state,
      issues: [
        {
          code: ISSUE_CODES.RUNTIME_DIAGNOSTIC,
          severity: "error",
          category: "runtime",
          message: "step guard exhausted",
        },
      ],
      diagnostics: ["step guard exhausted"],
    };
  }

  private pushTrace(nodeId: string): void {
    this.trace.push({
      timestamp_ms: Date.now(),
      node_id: nodeId,
      state: this.state,
      sensor_snapshot: {},
    });
  }

  private executeTopLevelDistanceMove(
    node: Extract<RoboticsIRNode, { kind: "move" }>,
    collector: RuntimeCollector,
    budgetMs: number,
  ): boolean {
    const speedPct = node.speed_pct ?? 100;
    const linearSpeed =
      (speedPct / 100) * this.runtimeBehavior.maxLinearSpeedCmS;
    const directionSign = node.direction === "forward" ? 1 : -1;
    const targetLinear = directionSign * linearSpeed;
    const distanceCm = toDistanceCm(node.unit, Math.abs(node.value));
    if (distanceCm <= 0) return true;

    if (
      !this.activeDistanceMove ||
      this.activeDistanceMove.nodeId !== node.id
    ) {
      this.activeDistanceMove = this.physicsEngine.startDistanceMove({
        nodeId: node.id,
        distanceCm,
        targetLinearCmS: targetLinear,
        maxDurationMs: Math.max(
          500,
          (distanceCm / Math.max(0.001, Math.abs(linearSpeed))) * 1000 * 4,
        ),
      });
    }

    const move = this.activeDistanceMove;
    const moveCollisionPolicy: MoveCollisionPolicy =
      this.executionOptions.moveCollisionPolicy || "hold_until_distance";
    const result = this.physicsEngine.progressDistanceMove({
      state: move,
      budgetMs,
      collisionPolicy: moveCollisionPolicy,
    });
    if (result.hasCollisionError) {
      this.state = "error";
      reportRuntimeIssue(
        collector,
        ISSUE_CODES.COLLISION_DETECTED,
        `Collision detected and move aborted by policy: ${Array.from(move.collisions).join(", ")}`,
      );
    }
    if (!result.done) return false;

    this.physicsEngine.settle(120);
    if (
      move.collisions.size > 0 &&
      moveCollisionPolicy !== "error_on_collision"
    ) {
      reportRuntimeIssue(
        collector,
        ISSUE_CODES.COLLISION_DETECTED,
        `Collision detected: ${Array.from(move.collisions).join(", ")}`,
      );
    }
    this.activeDistanceMove = null;
    return true;
  }

  private executeTopLevelTurn(
    node: Extract<RoboticsIRNode, { kind: "turn" }>,
    budgetMs: number,
  ): boolean {
    const speedPct = node.speed_pct ?? 100;
    const turnSpeed = (speedPct / 100) * this.runtimeBehavior.maxTurnSpeedDegS;
    const directionSign = node.direction === "left" ? -1 : 1;
    const targetAngle = Math.abs(node.angle_deg);
    const turnLinearCreep = computeTurnCreepLinearCmS(
      this.runtimeBehavior.maxLinearSpeedCmS,
      speedPct,
    );
    if (targetAngle <= 0) return true;
    if (!this.activeTurnMove || this.activeTurnMove.nodeId !== node.id) {
      this.activeTurnMove = this.physicsEngine.startTurnMove({
        nodeId: node.id,
        targetAngleDeg: targetAngle,
        targetAngularDegS: directionSign * turnSpeed,
        targetLinearCmS: turnLinearCreep,
        maxDurationMs: Math.max(
          500,
          (targetAngle / Math.max(0.001, Math.abs(turnSpeed))) * 1000 * 4,
        ),
      });
    }
    const result = this.physicsEngine.progressTurnMove({
      state: this.activeTurnMove,
      budgetMs,
    });
    if (!result.done) return false;
    this.physicsEngine.snapTurnHeading(this.activeTurnMove);
    this.physicsEngine.settle(90);
    this.activeTurnMove = null;
    return true;
  }

  private executeNode(node: RoboticsIRNode, collector: RuntimeCollector): void {
    if (this.state === "error") return;

    switch (node.kind) {
      case "move": {
        const speedPct = node.speed_pct ?? 100;
        const linearSpeed =
          (speedPct / 100) * this.runtimeBehavior.maxLinearSpeedCmS;
        const directionSign = node.direction === "forward" ? 1 : -1;
        const targetLinear = directionSign * linearSpeed;
        if (node.unit === "seconds") {
          const totalMs = Math.max(0, node.value) * 1000;
          const { collisions } = this.tickForDuration(totalMs, targetLinear, 0);
          if (collisions.size > 0) {
            reportRuntimeIssue(
              collector,
              ISSUE_CODES.COLLISION_DETECTED,
              `Collision detected: ${Array.from(collisions).join(", ")}`,
            );
          }
          return;
        }

        const distanceCm = toDistanceCm(node.unit, Math.abs(node.value));
        if (distanceCm <= 0) return;
        const start = this.physicsEngine.sample();
        let traveled = 0;
        let guardMs = 0;
        let previousPosition = start.pose.position;
        const maxDurationMs = Math.max(
          500,
          (distanceCm / Math.max(0.001, Math.abs(linearSpeed))) * 1000 * 4,
        );
        const allCollisions = new Set<string>();
        while (traveled < distanceCm && guardMs < maxDurationMs) {
          const step = Math.min(
            this.physicsEngine.getFixedStepMs(),
            maxDurationMs - guardMs,
          );
          const frame = this.physicsEngine.tickForDuration(
            step,
            targetLinear,
            0,
          );
          const sampled = this.physicsEngine.sample();
          const frameCollisions = frame.collisions;
          const posePosition = sampled.pose.position;
          const dx = posePosition.x - previousPosition.x;
          const dy = posePosition.y - previousPosition.y;
          traveled += Math.sqrt(dx * dx + dy * dy);
          previousPosition = posePosition;
          frameCollisions.forEach((id) => allCollisions.add(id));
          if (frameCollisions.size > 0) break;
          guardMs += step;
        }
        this.physicsEngine.settle(120);
        if (allCollisions.size > 0) {
          reportRuntimeIssue(
            collector,
            ISSUE_CODES.COLLISION_DETECTED,
            `Collision detected: ${Array.from(allCollisions).join(", ")}`,
          );
        }
        return;
      }
      case "turn": {
        const speedPct = node.speed_pct ?? 100;
        const turnSpeed =
          (speedPct / 100) * this.runtimeBehavior.maxTurnSpeedDegS;
        const directionSign = node.direction === "left" ? -1 : 1;
        const targetAngle = Math.abs(node.angle_deg);
        if (targetAngle <= 0) return;
        const inlineTurn = this.physicsEngine.startTurnMove({
          nodeId: node.id,
          targetAngleDeg: targetAngle,
          targetAngularDegS: directionSign * turnSpeed,
          targetLinearCmS: computeTurnCreepLinearCmS(
            this.runtimeBehavior.maxLinearSpeedCmS,
            speedPct,
          ),
          maxDurationMs: Math.max(
            500,
            (targetAngle / Math.max(0.001, Math.abs(turnSpeed))) * 1000 * 4,
          ),
        });
        const inlineBudget =
          inlineTurn.maxDurationMs + this.physicsEngine.getFixedStepMs() * 2;
        this.physicsEngine.progressTurnMove({
          state: inlineTurn,
          budgetMs: inlineBudget,
        });
        this.physicsEngine.snapTurnHeading(inlineTurn);
        this.physicsEngine.settle(90);
        return;
      }
      case "wait": {
        this.tickForDuration(Math.max(0, node.seconds) * 1000, 0, 0);
        return;
      }
      case "set_motor":
        this.executeSetMotor(
          node.motor_id,
          node.speed_pct,
          node.duration_sec,
          collector,
        );
        return;
      case "actuator_action":
        this.executeActuatorAction(
          node.actuator_id,
          node.action,
          node.value,
          node.duration_sec,
          collector,
        );
        return;
      case "read_sensor": {
        const result = this.physicsEngine.sample();
        this.setVariable(
          node.output_var,
          (result.sensor_values[node.sensor] ?? 0) as RuntimeValue,
        );
        return;
      }
      case "assign":
        this.setVariable(node.variable, this.evaluateExpression(node.value));
        return;
      case "return":
        if (this.callFrames.length === 0) {
          reportRuntimeIssue(
            collector,
            ISSUE_CODES.RETURN_OUTSIDE_FUNCTION,
            `return outside function ignored (${node.id})`,
          );
          return;
        }
        this.markReturn(node.value ? this.evaluateExpression(node.value) : 0);
        return;
      case "emit_event":
        reportRuntimeIssue(
          collector,
          ISSUE_CODES.RUNTIME_DIAGNOSTIC,
          `emit_event captured: ${node.event_name}`,
          "info",
        );
        return;
      case "call":
        this.executeCall(node.function_id, node.args || [], collector);
        return;
      case "if": {
        const branch = this.evaluateCondition(node.condition)
          ? node.then_nodes
          : node.else_nodes || [];
        this.executeInlineNodes(branch, collector);
        return;
      }
      case "repeat": {
        if (typeof node.times === "number") {
          const repeatCount = Math.max(0, Math.floor(node.times));
          for (let i = 0; i < repeatCount; i += 1) {
            this.executeInlineNodes(node.body, collector);
            if (this.getState() === "error") break;
          }
        } else if (node.while) {
          let guard = 0;
          while (this.evaluateCondition(node.while) && guard < 1000) {
            this.executeInlineNodes(node.body, collector);
            guard += 1;
            if (this.getState() === "error") break;
          }
          if (guard >= 1000) {
            reportRuntimeIssue(
              collector,
              ISSUE_CODES.LOOP_SAFETY_CAP,
              "repeat while loop reached safety cap (1000 iterations)",
            );
          }
        }
        return;
      }
      default:
        this.state = "error";
        reportRuntimeIssue(
          collector,
          ISSUE_CODES.RUNTIME_DIAGNOSTIC,
          `Unsupported node kind: ${(node as { kind: string }).kind}`,
        );
    }
  }

  private executeCall(
    functionId: string,
    args: RoboticsExpression[],
    collector: RuntimeCollector,
  ): void {
    if (!this.program?.functions?.length) {
      reportRuntimeIssue(
        collector,
        ISSUE_CODES.CALL_UNRESOLVED,
        `call unresolved: function "${functionId}" is not defined`,
      );
      this.state = "error";
      return;
    }
    const fn =
      this.program.functions.find((item) => item.id === functionId) ??
      this.program.functions.find((item) => item.name === functionId);
    if (!fn) {
      reportRuntimeIssue(
        collector,
        ISSUE_CODES.CALL_UNRESOLVED,
        `call unresolved: function "${functionId}" is not defined`,
      );
      this.state = "error";
      return;
    }
    if (this.callDepth >= IRRuntimeExecutor.MAX_CALL_DEPTH) {
      reportRuntimeIssue(
        collector,
        ISSUE_CODES.CALL_STACK_OVERFLOW,
        `call stack overflow at function "${functionId}"`,
      );
      this.state = "error";
      return;
    }

    const frame: CallFrame = {
      frameId: `legacy_call_${this.callFrameSequence++}_${functionId}`,
      functionId,
      vars: new Map<string, RuntimeValue>(),
      didReturn: false,
      returnValue: 0,
    };
    for (let i = 0; i < fn.params.length; i += 1) {
      const param = fn.params[i];
      const argExpr = args[i];
      const resolvedArg = this.resolveCallArgument(argExpr);
      frame.vars.set(param, (resolvedArg ?? 0) as RuntimeValue);
    }
    this.callFrames.push(frame);

    this.callDepth += 1;
    this.executeInlineNodes(fn.body, collector);
    this.callDepth -= 1;
    this.callFrames.pop();
  }

  private tickForDuration(
    totalMs: number,
    linearVelocityCmS: number,
    angularVelocityDegS: number,
  ): { collisions: Set<string> } {
    return this.physicsEngine.tickForDuration(
      totalMs,
      linearVelocityCmS,
      angularVelocityDegS,
    );
  }

  private executeSetMotor(
    motorId: string,
    speedPctRaw: number,
    durationSecRaw: number | undefined,
    collector: RuntimeCollector,
  ): void {
    const key = String(motorId || "")
      .trim()
      .toLowerCase();
    const behavior = this.runtimeBehavior.motorBehaviors[key];
    if (!behavior) {
      if (
        this.tryExecuteRegisteredActuatorAction(
          key,
          "set_speed",
          speedPctRaw,
          durationSecRaw,
          undefined,
          collector,
        )
      ) {
        return;
      }
      reportRuntimeIssue(
        collector,
        ISSUE_CODES.KIT_ACTION_UNSUPPORTED,
        `set_motor unsupported for active kit: ${motorId}`,
      );
      return;
    }
    if (behavior.mode === "none") {
      if (
        this.tryExecuteRegisteredActuatorAction(
          key,
          "set_speed",
          speedPctRaw,
          durationSecRaw,
          undefined,
          collector,
        )
      ) {
        return;
      }
      reportRuntimeIssue(
        collector,
        ISSUE_CODES.KIT_ACTION_NO_KINEMATICS,
        `set_motor ${motorId} is not mapped to simulator motion`,
      );
      return;
    }
    const speedPct = Math.max(-100, Math.min(100, Number(speedPctRaw) || 0));
    const axisSign = behavior.axisSign === -1 ? -1 : 1;
    const durationSec = Math.max(
      0,
      Number(durationSecRaw ?? behavior.defaultDurationSec ?? 0.8),
    );
    const maxSpeed =
      Number(behavior.maxSpeed) ||
      (behavior.mode === "linear"
        ? this.runtimeBehavior.maxLinearSpeedCmS
        : this.runtimeBehavior.maxTurnSpeedDegS);
    const signedSpeed = (speedPct / 100) * maxSpeed * axisSign;
    if (behavior.mode === "linear") {
      this.tickForDuration(durationSec * 1000, signedSpeed, 0);
    } else {
      this.tickForDuration(durationSec * 1000, 0, signedSpeed);
    }
    this.tickForDuration(80, 0, 0);
  }

  private executeActuatorAction(
    actuatorId: string,
    action: string,
    value: string | number | boolean | undefined,
    durationSec: number | undefined,
    collector: RuntimeCollector,
  ): void {
    const handled = this.tryExecuteRegisteredActuatorAction(
      actuatorId,
      action,
      undefined,
      durationSec,
      value,
      collector,
    );
    if (!handled) {
      reportRuntimeIssue(
        collector,
        ISSUE_CODES.KIT_ACTION_UNSUPPORTED,
        `actuator_action unsupported for active kit: ${actuatorId}.${action}`,
      );
    }
  }

  private tryExecuteRegisteredActuatorAction(
    actuatorId: string,
    action: string,
    speedPct: number | undefined,
    durationSec: number | undefined,
    value: string | number | boolean | undefined,
    collector: RuntimeCollector,
  ): boolean {
    const handler = this.resolveActuatorAction?.(
      String(actuatorId || "")
        .trim()
        .toLowerCase(),
      String(action || "")
        .trim()
        .toLowerCase(),
    );
    if (!handler) return false;
    const result = handler(
      {
        actuatorId,
        action,
        speedPct,
        durationSec,
        value,
      },
      {
        simulator: this.simulator,
        runtimeBehavior: this.runtimeBehavior,
        tickForDuration: (totalMs, linearVelocityCmS, angularVelocityDegS) => {
          this.tickForDuration(totalMs, linearVelocityCmS, angularVelocityDegS);
        },
      },
    );
    if (result && typeof result === "object") {
      if (Array.isArray(result.diagnostics) && result.diagnostics.length > 0) {
        result.diagnostics.forEach((message) => {
          reportRuntimeIssue(
            collector,
            ISSUE_CODES.RUNTIME_DIAGNOSTIC,
            message,
          );
        });
      }
      return result.handled !== false;
    }
    return true;
  }

  private executeInlineNodes(
    nodes: RoboticsIRNode[],
    collector: RuntimeCollector,
  ): void {
    for (const child of nodes) {
      this.executeNode(child, collector);
      if (this.state === "error") break;
      if (this.hasReturnedFromCurrentFrame()) break;
    }
  }

  private evaluateCondition(condition: RoboticsCondition): boolean {
    switch (condition.op) {
      case "sensor_gt":
      case "sensor_lt": {
        const sensorValue = this.readSensorValue(condition.sensor);
        if (typeof sensorValue !== "number") return false;
        return condition.op === "sensor_gt"
          ? sensorValue > condition.value
          : sensorValue < condition.value;
      }
      case "eq":
        return (
          this.evaluateExpression(condition.left) ===
          this.evaluateExpression(condition.right)
        );
      case "and":
        return condition.conditions.every((child) =>
          this.evaluateCondition(child),
        );
      case "or":
        return condition.conditions.some((child) =>
          this.evaluateCondition(child),
        );
      case "not":
        return !this.evaluateCondition(condition.condition);
      default:
        return false;
    }
  }

  private evaluateExpression(
    expression: RoboticsExpression,
  ): string | number | boolean {
    switch (expression.type) {
      case "number":
      case "boolean":
      case "string":
        return expression.value;
      case "var":
        return this.getVariable(expression.name) ?? 0;
      case "sensor":
        return this.readSensorValue(expression.sensor);
      case "binary": {
        const left = this.evaluateExpression(expression.left);
        const right = this.evaluateExpression(expression.right);
        const leftNum = typeof left === "number" ? left : Number(left) || 0;
        const rightNum = typeof right === "number" ? right : Number(right) || 0;
        if (expression.op === "add") return leftNum + rightNum;
        if (expression.op === "sub") return leftNum - rightNum;
        if (expression.op === "mul") return leftNum * rightNum;
        if (expression.op === "div")
          return rightNum === 0 ? 0 : leftNum / rightNum;
        return 0;
      }
      default:
        return 0;
    }
  }

  private readSensorValue(sensor: string): string | number | boolean {
    const result = this.physicsEngine.sample();
    return result.sensor_values[sensor] ?? 0;
  }

  private resolveCallArgument(
    arg: RoboticsExpression | undefined,
  ): RuntimeValue | undefined {
    if (!arg) return undefined;
    return this.evaluateExpression(arg);
  }

  private currentFrame(): CallFrame | null {
    if (this.callFrames.length === 0) return null;
    return this.callFrames[this.callFrames.length - 1] || null;
  }

  private setVariable(name: string, value: RuntimeValue): void {
    const frame = this.currentFrame();
    if (frame) {
      frame.vars.set(name, value);
      return;
    }
    this.globalVariables.set(name, value);
  }

  private hasVariable(name: string): boolean {
    for (let i = this.callFrames.length - 1; i >= 0; i -= 1) {
      if (this.callFrames[i].vars.has(name)) return true;
    }
    return this.globalVariables.has(name);
  }

  private getVariable(name: string): RuntimeValue | undefined {
    for (let i = this.callFrames.length - 1; i >= 0; i -= 1) {
      if (this.callFrames[i].vars.has(name)) {
        return this.callFrames[i].vars.get(name);
      }
    }
    return this.globalVariables.get(name);
  }

  private markReturn(value: RuntimeValue): void {
    const frame = this.currentFrame();
    if (!frame) return;
    frame.returnValue = value;
    frame.didReturn = true;
  }

  private hasReturnedFromCurrentFrame(): boolean {
    const frame = this.currentFrame();
    return Boolean(frame?.didReturn);
  }

  private tryExpandControlNode(
    node: RoboticsIRNode,
    collector: RuntimeCollector,
    ownerCallFrameId?: string,
  ): boolean {
    if (node.kind === "if") {
      const branch = this.evaluateCondition(node.condition)
        ? node.then_nodes
        : node.else_nodes || [];
      this.enqueueFront(branch, `${node.id}_if`, ownerCallFrameId);
      return true;
    }
    if (node.kind !== "repeat") return false;
    if (typeof node.times === "number") {
      const repeatCount = Math.max(0, Math.floor(node.times));
      if (repeatCount <= 0) return true;
      const repeatNode = cloneNode(node) as Extract<
        RoboticsIRNode,
        { kind: "repeat" }
      >;
      const nextRepeat: Extract<RoboticsIRNode, { kind: "repeat" }> = {
        ...repeatNode,
        times: repeatCount - 1,
      };
      this.enqueueFront(
        [...node.body, nextRepeat],
        `${node.id}_repeat`,
        ownerCallFrameId,
      );
      return true;
    }
    if (!node.while) return true;
    const key = node.id;
    if (!this.evaluateCondition(node.while)) {
      this.repeatWhileGuards.delete(key);
      return true;
    }
    const nextCount = (this.repeatWhileGuards.get(key) || 0) + 1;
    this.repeatWhileGuards.set(key, nextCount);
    if (nextCount > 1000) {
      reportRuntimeIssue(
        collector,
        ISSUE_CODES.LOOP_SAFETY_CAP,
        "repeat while loop reached safety cap (1000 iterations)",
      );
      return true;
    }
    this.enqueueFront(
      [...node.body, node],
      `${node.id}_while`,
      ownerCallFrameId,
    );
    return true;
  }

  private enqueueFront(
    nodes: RoboticsIRNode[],
    tag: string,
    ownerCallFrameId?: string,
  ): void {
    if (!Array.isArray(nodes) || nodes.length === 0) return;
    const cloned: PendingExecutionEntry[] = nodes.map((child, index) => ({
      kind: "node",
      node: this.cloneNodeForQueue(child, `${tag}_${index}`),
      ownerCallFrameId,
    }));
    this.pendingNodes = [...cloned, ...this.pendingNodes];
  }

  private scheduleFunctionCall(
    node: Extract<RoboticsIRNode, { kind: "call" }>,
    collector: RuntimeCollector,
    ownerCallFrameId?: string,
  ): RuntimeSemanticEvent {
    if (!this.program?.functions?.length) {
      reportRuntimeIssue(
        collector,
        ISSUE_CODES.CALL_UNRESOLVED,
        `call unresolved: function "${node.function_id}" is not defined`,
      );
      this.state = "error";
      return this.buildSemanticEvent(
        "node_executed",
        node.id,
        "call_unresolved",
      );
    }
    const fn =
      this.program.functions.find((item) => item.id === node.function_id) ??
      this.program.functions.find((item) => item.name === node.function_id);
    if (!fn) {
      reportRuntimeIssue(
        collector,
        ISSUE_CODES.CALL_UNRESOLVED,
        `call unresolved: function "${node.function_id}" is not defined`,
      );
      this.state = "error";
      return this.buildSemanticEvent(
        "node_executed",
        node.id,
        "call_unresolved",
      );
    }
    if (this.callDepth >= IRRuntimeExecutor.MAX_CALL_DEPTH) {
      reportRuntimeIssue(
        collector,
        ISSUE_CODES.CALL_STACK_OVERFLOW,
        `call stack overflow at function "${node.function_id}"`,
      );
      this.state = "error";
      return this.buildSemanticEvent(
        "node_executed",
        node.id,
        "call_stack_overflow",
      );
    }
    const frameId = `call_${this.callFrameSequence++}_${fn.id}`;
    const frame: CallFrame = {
      frameId,
      functionId: fn.id,
      vars: new Map<string, RuntimeValue>(),
      didReturn: false,
      returnValue: 0,
    };
    for (let i = 0; i < fn.params.length; i += 1) {
      const param = fn.params[i];
      const argExpr = node.args?.[i];
      const resolvedArg = this.resolveCallArgument(argExpr);
      frame.vars.set(param, (resolvedArg ?? 0) as RuntimeValue);
    }
    this.callFrames.push(frame);
    this.callDepth += 1;
    const bodyEntries: PendingExecutionEntry[] = fn.body.map(
      (child, index) => ({
        kind: "node",
        node: this.cloneNodeForQueue(child, `${node.id}_call_${index}`),
        ownerCallFrameId: frameId,
      }),
    );
    bodyEntries.push({
      kind: "call_end",
      callFrameId: frameId,
      nodeId: `${node.id}__return`,
    });
    if (ownerCallFrameId) {
      for (const entry of bodyEntries) {
        if (entry.kind === "node" && !entry.ownerCallFrameId) {
          entry.ownerCallFrameId = ownerCallFrameId;
        }
      }
    }
    this.pendingNodes = [...bodyEntries, ...this.pendingNodes];
    return this.buildSemanticEvent("call_enter", node.id, fn.name || fn.id);
  }

  private cloneNodeForQueue(node: RoboticsIRNode, tag: string): RoboticsIRNode {
    const clone = cloneNode(node);
    clone.id = `${clone.id}__q${this.queueSequence++}_${tag}`;
    return clone;
  }

  private peekNextEntry(): PendingExecutionEntry | null {
    if (this.pendingNodes.length > 0) {
      return this.pendingNodes[0] || null;
    }
    if (!this.program || this.cursor >= this.program.nodes.length) return null;
    return {
      kind: "node",
      node: this.program.nodes[this.cursor],
    };
  }

  private consumeNextEntry(): void {
    if (this.pendingNodes.length > 0) {
      this.pendingNodes.shift();
      return;
    }
    this.cursor += 1;
  }

  private markCompletedIfDone(): void {
    if (
      this.cursor >= (this.program?.nodes.length || 0) &&
      this.pendingNodes.length === 0 &&
      this.state !== "error"
    ) {
      this.state = "completed";
    }
  }

  private isCallFrameReturned(frameId: string): boolean {
    const frame = this.callFrames.find((item) => item.frameId === frameId);
    return Boolean(frame?.didReturn);
  }

  private popCallFrame(frameId: string): void {
    const idx = this.callFrames.findIndex((frame) => frame.frameId === frameId);
    if (idx >= 0) {
      this.callFrames.splice(idx, 1);
      this.callDepth = Math.max(0, this.callDepth - 1);
    }
  }

  private buildControlBoundaryEvent(
    node: RoboticsIRNode,
  ): RuntimeSemanticEvent {
    if (node.kind === "if") {
      const result = this.evaluateCondition(node.condition);
      return this.buildSemanticEvent(
        "condition_evaluated",
        node.id,
        result ? "then" : "else",
        result,
      );
    }
    if (node.kind === "repeat") {
      if (typeof node.times === "number") {
        return this.buildSemanticEvent(
          node.times > 0 ? "loop_check" : "loop_exit",
          node.id,
          `times:${node.times}`,
        );
      }
      if (node.while) {
        const result = this.evaluateCondition(node.while);
        return this.buildSemanticEvent(
          result ? "loop_check" : "loop_exit",
          node.id,
          "while",
          result,
        );
      }
      return this.buildSemanticEvent("loop_exit", node.id);
    }
    return this.buildSemanticEvent("node_executed", node.id);
  }

  private buildSemanticEvent(
    type: RuntimeSemanticEvent["type"],
    nodeId: string,
    detail?: string,
    conditionResult?: boolean,
  ): RuntimeSemanticEvent {
    return {
      type,
      nodeId,
      detail,
      callDepth: this.callDepth,
      conditionResult,
      variables: this.snapshotVariables(),
    };
  }

  private snapshotVariables(): Record<string, RuntimeValue> {
    const snapshot: Record<string, RuntimeValue> = {};
    this.globalVariables.forEach((value, key) => {
      snapshot[key] = value;
    });
    const frame = this.currentFrame();
    if (frame) {
      frame.vars.forEach((value, key) => {
        snapshot[`local:${key}`] = value;
      });
    }
    return snapshot;
  }
}

function cloneProgram(program: RoboticsProgram): RoboticsProgram {
  return JSON.parse(JSON.stringify(program)) as RoboticsProgram;
}

function cloneNode(node: RoboticsIRNode): RoboticsIRNode {
  return JSON.parse(JSON.stringify(node)) as RoboticsIRNode;
}
