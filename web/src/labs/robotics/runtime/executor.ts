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
import type { RuntimeExecutor, RuntimeIssue, RuntimeTickResult, RuntimeTraceEntry } from "./types";

const PHYSICS_STEP_MS = 20;
type RuntimeValue = string | number | boolean;

interface CallFrame {
  functionId: string;
  vars: Map<string, RuntimeValue>;
  didReturn: boolean;
  returnValue: RuntimeValue;
}

interface ActiveDistanceMove {
  nodeId: string;
  remainingCm: number;
  targetLinearCmS: number;
  previousPosition: { x: number; y: number };
  elapsedMs: number;
  maxDurationMs: number;
  collisions: Set<string>;
}

type MoveCollisionPolicy = "hold_until_distance" | "abort_on_collision" | "timeout_then_continue" | "error_on_collision";

interface RuntimeExecutionOptions {
  moveCollisionPolicy?: MoveCollisionPolicy;
}

function normalizeSignedAngle(delta: number): number {
  return ((delta + 540) % 360) - 180;
}

function toDistanceCm(unit: string, value: number): number {
  if (unit === "distance_mm") return value / 10;
  if (unit === "distance_in") return value * 2.54;
  return value;
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
  private activeDistanceMove: ActiveDistanceMove | null = null;

  private static readonly MAX_CALL_DEPTH = 32;

  constructor(
    private simulator: RoboticsSimulatorBridge,
    private runtimeBehavior: KitRuntimeBehaviorProfile = {
      maxLinearSpeedCmS: 25,
      maxTurnSpeedDegS: 120,
      motorBehaviors: {},
    },
    private resolveActuatorAction: ((actuatorId: string, action: string) => KitActuatorActionHandler | null) | null = null,
    private executionOptions: RuntimeExecutionOptions = {},
  ) {}

  load(program: RoboticsProgram): void {
    this.program = program;
    this.cursor = 0;
    this.state = "idle";
    this.globalVariables.clear();
    this.callFrames = [];
    this.trace = [];
    this.activeDistanceMove = null;
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
  }

  getState(): "idle" | "running" | "paused" | "completed" | "error" {
    return this.state;
  }

  getTrace(): RuntimeTraceEntry[] {
    return this.trace.slice();
  }

  step(simulation_budget_ms = 200): RuntimeTickResult {
    const simulationBudgetMs = Math.max(PHYSICS_STEP_MS, Number(simulation_budget_ms) || 200);
    if (!this.program) {
      this.state = "error";
      const collector: RuntimeCollector = { diagnostics: [], issues: [] };
      reportRuntimeIssue(collector, ISSUE_CODES.RUNTIME_DIAGNOSTIC, "No program loaded");
      return { state: this.state, diagnostics: collector.diagnostics, issues: collector.issues };
    }
    if (this.state === "paused" || this.state === "idle") {
      return { state: this.state, issues: [] };
    }
    if (this.cursor >= this.program.nodes.length) {
      this.state = "completed";
      return { state: this.state, issues: [] };
    }

    const node = this.program.nodes[this.cursor];
    const collector: RuntimeCollector = { diagnostics: [], issues: [] };
    let completedNode = true;
    if (node.kind === "move" && node.unit !== "seconds") {
      completedNode = this.executeTopLevelDistanceMove(node, collector, simulationBudgetMs);
    } else {
      this.activeDistanceMove = null;
      this.executeNode(node, collector);
    }

    this.trace.push({
      timestamp_ms: Date.now(),
      node_id: node.id,
      state: this.state,
      sensor_snapshot: {},
    });

    if (completedNode) {
      this.cursor += 1;
      if (this.cursor >= this.program.nodes.length && this.state !== "error") {
        this.state = "completed";
      }
    }

    return {
      state: this.state,
      highlightedNodeId: node.id,
      diagnostics: collector.diagnostics,
      issues: collector.issues,
    };
  }

  private executeTopLevelDistanceMove(
    node: Extract<RoboticsIRNode, { kind: "move" }>,
    collector: RuntimeCollector,
    budgetMs: number,
  ): boolean {
    const speedPct = node.speed_pct ?? 100;
    const linearSpeed = (speedPct / 100) * this.runtimeBehavior.maxLinearSpeedCmS;
    const directionSign = node.direction === "forward" ? 1 : -1;
    const targetLinear = directionSign * linearSpeed;
    const distanceCm = toDistanceCm(node.unit, Math.abs(node.value));
    if (distanceCm <= 0) return true;

    if (!this.activeDistanceMove || this.activeDistanceMove.nodeId !== node.id) {
      const start = this.simulator.tick({
        dt_ms: 0,
        linear_velocity_cm_s: 0,
        angular_velocity_deg_s: 0,
      });
      this.activeDistanceMove = {
        nodeId: node.id,
        remainingCm: distanceCm,
        targetLinearCmS: targetLinear,
        previousPosition: { ...start.pose.position },
        elapsedMs: 0,
        maxDurationMs: Math.max(500, (distanceCm / Math.max(0.001, Math.abs(linearSpeed))) * 1000 * 4),
        collisions: new Set<string>(),
      };
    }

    const move = this.activeDistanceMove;
    const moveCollisionPolicy: MoveCollisionPolicy = this.executionOptions.moveCollisionPolicy || "hold_until_distance";
    let remainingBudgetMs = Math.max(PHYSICS_STEP_MS, budgetMs);
    while (
      remainingBudgetMs > 0 &&
      move.remainingCm > 0 &&
      (moveCollisionPolicy !== "timeout_then_continue" || move.elapsedMs < move.maxDurationMs)
    ) {
      const step = Math.min(PHYSICS_STEP_MS, remainingBudgetMs);
      const frame = this.simulator.tick({
        dt_ms: step,
        linear_velocity_cm_s: move.targetLinearCmS,
        angular_velocity_deg_s: 0,
      });
      const dx = frame.pose.position.x - move.previousPosition.x;
      const dy = frame.pose.position.y - move.previousPosition.y;
      move.remainingCm = Math.max(0, move.remainingCm - Math.sqrt(dx * dx + dy * dy));
      move.previousPosition = frame.pose.position;
      frame.collisions.forEach((id) => move.collisions.add(id));
      move.elapsedMs += step;
      remainingBudgetMs -= step;
      if (frame.collisions.length > 0) break;
    }

    let done = move.remainingCm <= 0;
    if (!done) {
      if (moveCollisionPolicy === "abort_on_collision" && move.collisions.size > 0) {
        done = true;
      } else if (moveCollisionPolicy === "timeout_then_continue" && move.elapsedMs >= move.maxDurationMs) {
        done = true;
      } else if (moveCollisionPolicy === "error_on_collision" && move.collisions.size > 0) {
        done = true;
        this.state = "error";
        reportRuntimeIssue(
          collector,
          ISSUE_CODES.COLLISION_DETECTED,
          `Collision detected and move aborted by policy: ${Array.from(move.collisions).join(", ")}`,
        );
      }
    }
    if (!done) return false;

    this.tickForDuration(120, 0, 0);
    if (move.collisions.size > 0 && moveCollisionPolicy !== "error_on_collision") {
      reportRuntimeIssue(
        collector,
        ISSUE_CODES.COLLISION_DETECTED,
        `Collision detected: ${Array.from(move.collisions).join(", ")}`,
      );
    }
    this.activeDistanceMove = null;
    return true;
  }

  private executeNode(node: RoboticsIRNode, collector: RuntimeCollector): void {
    if (this.state === "error") return;

    switch (node.kind) {
      case "move": {
        const speedPct = node.speed_pct ?? 100;
        const linearSpeed = (speedPct / 100) * this.runtimeBehavior.maxLinearSpeedCmS;
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
        const start = this.simulator.tick({
          dt_ms: 0,
          linear_velocity_cm_s: 0,
          angular_velocity_deg_s: 0,
        });
        let traveled = 0;
        let guardMs = 0;
        let previousPosition = start.pose.position;
        const maxDurationMs = Math.max(
          500,
          (distanceCm / Math.max(0.001, Math.abs(linearSpeed))) * 1000 * 4,
        );
        const allCollisions = new Set<string>();
        while (traveled < distanceCm && guardMs < maxDurationMs) {
          const step = Math.min(PHYSICS_STEP_MS, maxDurationMs - guardMs);
          const frame = this.simulator.tick({
            dt_ms: step,
            linear_velocity_cm_s: targetLinear,
            angular_velocity_deg_s: 0,
          });
          const dx = frame.pose.position.x - previousPosition.x;
          const dy = frame.pose.position.y - previousPosition.y;
          traveled += Math.sqrt(dx * dx + dy * dy);
          previousPosition = frame.pose.position;
          frame.collisions.forEach((id) => allCollisions.add(id));
          if (frame.collisions.length > 0) break;
          guardMs += step;
        }
        this.tickForDuration(120, 0, 0);
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
        const turnSpeed = (speedPct / 100) * this.runtimeBehavior.maxTurnSpeedDegS;
        const directionSign = node.direction === "left" ? -1 : 1;
        const start = this.simulator.tick({
          dt_ms: 0,
          linear_velocity_cm_s: 0,
          angular_velocity_deg_s: 0,
        });
        const targetAngle = Math.abs(node.angle_deg);
        let turned = 0;
        let lastHeading = start.pose.heading_deg;
        let guardMs = 0;
        const maxDurationMs = Math.max(
          500,
          (targetAngle / Math.max(0.001, Math.abs(turnSpeed))) * 1000 * 4,
        );
        while (turned < targetAngle && guardMs < maxDurationMs) {
          const step = Math.min(PHYSICS_STEP_MS, maxDurationMs - guardMs);
          const frame = this.simulator.tick({
            dt_ms: step,
            linear_velocity_cm_s: 0,
            angular_velocity_deg_s: directionSign * turnSpeed,
          });
          const delta = normalizeSignedAngle(frame.pose.heading_deg - lastHeading);
          turned += Math.abs(delta);
          lastHeading = frame.pose.heading_deg;
          guardMs += step;
        }
        this.tickForDuration(90, 0, 0);
        return;
      }
      case "wait": {
        this.tickForDuration(Math.max(0, node.seconds) * 1000, 0, 0);
        return;
      }
      case "set_motor":
        this.executeSetMotor(node.motor_id, node.speed_pct, node.duration_sec, collector);
        return;
      case "actuator_action":
        this.executeActuatorAction(node.actuator_id, node.action, node.value, node.duration_sec, collector);
        return;
      case "read_sensor": {
        const result = this.simulator.tick({
          dt_ms: 0,
          linear_velocity_cm_s: 0,
          angular_velocity_deg_s: 0,
        });
        this.setVariable(node.output_var, (result.sensor_values[node.sensor] ?? 0) as RuntimeValue);
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
        const branch = this.evaluateCondition(node.condition) ? node.then_nodes : node.else_nodes || [];
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

  private executeCall(functionId: string, args: RoboticsExpression[], collector: RuntimeCollector): void {
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

  private tickForDuration(totalMs: number, linearVelocityCmS: number, angularVelocityDegS: number): { collisions: Set<string> } {
    let remaining = Math.max(0, totalMs);
    const collisions = new Set<string>();
    while (remaining > 0.0001) {
      const step = Math.min(PHYSICS_STEP_MS, remaining);
      const result = this.simulator.tick({
        dt_ms: step,
        linear_velocity_cm_s: linearVelocityCmS,
        angular_velocity_deg_s: angularVelocityDegS,
      });
      result.collisions.forEach((id) => collisions.add(id));
      remaining -= step;
    }
    return { collisions };
  }

  private executeSetMotor(motorId: string, speedPctRaw: number, durationSecRaw: number | undefined, collector: RuntimeCollector): void {
    const key = String(motorId || "").trim().toLowerCase();
    const behavior = this.runtimeBehavior.motorBehaviors[key];
    if (!behavior) {
      if (this.tryExecuteRegisteredActuatorAction(key, "set_speed", speedPctRaw, durationSecRaw, undefined, collector)) {
        return;
      }
      reportRuntimeIssue(collector, ISSUE_CODES.KIT_ACTION_UNSUPPORTED, `set_motor unsupported for active kit: ${motorId}`);
      return;
    }
    if (behavior.mode === "none") {
      if (this.tryExecuteRegisteredActuatorAction(key, "set_speed", speedPctRaw, durationSecRaw, undefined, collector)) {
        return;
      }
      reportRuntimeIssue(collector, ISSUE_CODES.KIT_ACTION_NO_KINEMATICS, `set_motor ${motorId} is not mapped to simulator motion`);
      return;
    }
    const speedPct = Math.max(-100, Math.min(100, Number(speedPctRaw) || 0));
    const axisSign = behavior.axisSign === -1 ? -1 : 1;
    const durationSec = Math.max(0, Number(durationSecRaw ?? behavior.defaultDurationSec ?? 0.8));
    const maxSpeed = Number(behavior.maxSpeed) || (behavior.mode === "linear"
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
    const handler = this.resolveActuatorAction?.(String(actuatorId || "").trim().toLowerCase(), String(action || "").trim().toLowerCase());
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
          reportRuntimeIssue(collector, ISSUE_CODES.RUNTIME_DIAGNOSTIC, message);
        });
      }
      return result.handled !== false;
    }
    return true;
  }

  private executeInlineNodes(nodes: RoboticsIRNode[], collector: RuntimeCollector): void {
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
        return condition.op === "sensor_gt" ? sensorValue > condition.value : sensorValue < condition.value;
      }
      case "eq":
        return this.evaluateExpression(condition.left) === this.evaluateExpression(condition.right);
      case "and":
        return condition.conditions.every((child) => this.evaluateCondition(child));
      case "or":
        return condition.conditions.some((child) => this.evaluateCondition(child));
      case "not":
        return !this.evaluateCondition(condition.condition);
      default:
        return false;
    }
  }

  private evaluateExpression(expression: RoboticsExpression): string | number | boolean {
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
        if (expression.op === "div") return rightNum === 0 ? 0 : leftNum / rightNum;
        return 0;
      }
      default:
        return 0;
    }
  }

  private readSensorValue(sensor: string): string | number | boolean {
    const result = this.simulator.tick({
      dt_ms: 0,
      linear_velocity_cm_s: 0,
      angular_velocity_deg_s: 0,
    });
    return result.sensor_values[sensor] ?? 0;
  }

  private resolveCallArgument(arg: RoboticsExpression | undefined): RuntimeValue | undefined {
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
}

