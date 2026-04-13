import type {
  RoboticsCondition,
  RoboticsExpression,
  RoboticsIRNode,
  RoboticsProgram,
} from "../../../lib/robotics";
import type { RoboticsSimulatorBridge } from "../simulator/types";
import type { RuntimeExecutor, RuntimeTickResult, RuntimeTraceEntry } from "./types";

const DEFAULT_LINEAR_SPEED_CM_S = 25;
const DEFAULT_TURN_SPEED_DEG_S = 120;
const PHYSICS_STEP_MS = 20;

function normalizeSignedAngle(delta: number): number {
  return ((delta + 540) % 360) - 180;
}

function toDistanceCm(unit: string, value: number): number {
  if (unit === "distance_mm") return value / 10;
  if (unit === "distance_in") return value * 2.54;
  return value;
}

export class IRRuntimeExecutor implements RuntimeExecutor {
  private program: RoboticsProgram | null = null;
  private cursor = 0;
  private state: "idle" | "running" | "paused" | "completed" | "error" = "idle";
  private variables = new Map<string, string | number | boolean>();
  private trace: RuntimeTraceEntry[] = [];

  constructor(private simulator: RoboticsSimulatorBridge) {}

  load(program: RoboticsProgram): void {
    this.program = program;
    this.cursor = 0;
    this.state = "idle";
    this.variables.clear();
    this.trace = [];
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
    this.variables.clear();
    this.trace = [];
  }

  getState(): "idle" | "running" | "paused" | "completed" | "error" {
    return this.state;
  }

  getTrace(): RuntimeTraceEntry[] {
    return this.trace.slice();
  }

  step(): RuntimeTickResult {
    if (!this.program) {
      this.state = "error";
      return { state: this.state, diagnostics: ["No program loaded"] };
    }
    if (this.state === "paused" || this.state === "idle") {
      return { state: this.state };
    }
    if (this.cursor >= this.program.nodes.length) {
      this.state = "completed";
      return { state: this.state };
    }

    const node = this.program.nodes[this.cursor];
    const diagnostics: string[] = [];
    this.executeNode(node, diagnostics);

    this.trace.push({
      timestamp_ms: Date.now(),
      node_id: node.id,
      state: this.state,
      sensor_snapshot: {},
    });

    this.cursor += 1;
    if (this.cursor >= this.program.nodes.length && this.state !== "error") {
      this.state = "completed";
    }

    return {
      state: this.state,
      highlightedNodeId: node.id,
      diagnostics,
    };
  }

  private executeNode(node: RoboticsIRNode, diagnostics: string[]): void {
    if (this.state === "error") return;

    switch (node.kind) {
      case "move": {
        const speedPct = node.speed_pct ?? 100;
        const linearSpeed = (speedPct / 100) * DEFAULT_LINEAR_SPEED_CM_S;
        const directionSign = node.direction === "forward" ? 1 : -1;
        const targetLinear = directionSign * linearSpeed;
        if (node.unit === "seconds") {
          const totalMs = Math.max(0, node.value) * 1000;
          const { collisions } = this.tickForDuration(totalMs, targetLinear, 0);
          if (collisions.size > 0) {
            diagnostics.push(`Collision detected: ${Array.from(collisions).join(", ")}`);
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
          diagnostics.push(`Collision detected: ${Array.from(allCollisions).join(", ")}`);
        }
        return;
      }
      case "turn": {
        const speedPct = node.speed_pct ?? 100;
        const turnSpeed = (speedPct / 100) * DEFAULT_TURN_SPEED_DEG_S;
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
        diagnostics.push(`set_motor not yet connected to actuator model (${node.motor_id})`);
        return;
      case "read_sensor": {
        const result = this.simulator.tick({
          dt_ms: 0,
          linear_velocity_cm_s: 0,
          angular_velocity_deg_s: 0,
        });
        this.variables.set(node.output_var, result.sensor_values[node.sensor] ?? 0);
        return;
      }
      case "assign":
        this.variables.set(node.variable, this.evaluateExpression(node.value));
        return;
      case "emit_event":
        diagnostics.push(`emit_event captured: ${node.event_name}`);
        return;
      case "call":
        diagnostics.push(`call unsupported in phase-0 executor: ${node.function_id}`);
        return;
      case "if": {
        const branch = this.evaluateCondition(node.condition) ? node.then_nodes : node.else_nodes || [];
        this.executeInlineNodes(branch, diagnostics);
        return;
      }
      case "repeat": {
        if (typeof node.times === "number") {
          const repeatCount = Math.max(0, Math.floor(node.times));
          for (let i = 0; i < repeatCount; i += 1) {
            this.executeInlineNodes(node.body, diagnostics);
            if (this.state === "error") break;
          }
        } else if (node.while) {
          let guard = 0;
          while (this.evaluateCondition(node.while) && guard < 1000) {
            this.executeInlineNodes(node.body, diagnostics);
            guard += 1;
            if (this.state === "error") break;
          }
          if (guard >= 1000) {
            diagnostics.push("repeat while loop reached safety cap (1000 iterations)");
          }
        }
        return;
      }
      default:
        this.state = "error";
        diagnostics.push(`Unsupported node kind: ${(node as { kind: string }).kind}`);
    }
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

  private executeInlineNodes(nodes: RoboticsIRNode[], diagnostics: string[]): void {
    for (const child of nodes) {
      this.executeNode(child, diagnostics);
      if (this.state === "error") break;
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
        return this.variables.get(expression.name) ?? 0;
      case "sensor":
        return this.readSensorValue(expression.sensor);
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
}

