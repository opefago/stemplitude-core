import type { RoboticsSimulatorBridge, SimulatorTickOutput } from "../simulator/types";

export const DEFAULT_PHYSICS_STEP_MS = 20;

export type MoveCollisionPolicy =
  | "hold_until_distance"
  | "abort_on_collision"
  | "timeout_then_continue"
  | "error_on_collision";

export interface ActiveDistanceMoveState {
  nodeId: string;
  remainingCm: number;
  targetLinearCmS: number;
  previousPosition: { x: number; y: number };
  elapsedMs: number;
  maxDurationMs: number;
  collisions: Set<string>;
}

export interface ActiveTurnMoveState {
  nodeId: string;
  targetAngleDeg: number;
  turnedDeg: number;
  startHeadingDeg: number;
  lastHeadingDeg: number;
  targetAngularDegS: number;
  targetLinearCmS: number;
  elapsedMs: number;
  maxDurationMs: number;
}

interface RuntimePhysicsEngineOptions {
  fixedStepMs?: number;
  maxStepIterations?: number;
}

interface StartDistanceMoveInput {
  nodeId: string;
  distanceCm: number;
  targetLinearCmS: number;
  maxDurationMs: number;
}

interface ProgressDistanceMoveInput {
  state: ActiveDistanceMoveState;
  budgetMs: number;
  collisionPolicy: MoveCollisionPolicy;
}

interface StartTurnMoveInput {
  nodeId: string;
  targetAngleDeg: number;
  targetAngularDegS: number;
  targetLinearCmS?: number;
  maxDurationMs: number;
}

interface ProgressTurnMoveInput {
  state: ActiveTurnMoveState;
  budgetMs: number;
}

interface ProgressTurnMoveResult {
  done: boolean;
  state: ActiveTurnMoveState;
}

interface ProgressDistanceMoveResult {
  done: boolean;
  hasCollisionError: boolean;
  state: ActiveDistanceMoveState;
}

export class RuntimePhysicsEngine {
  private readonly fixedStepMs: number;
  private readonly maxStepIterations: number;

  constructor(
    private simulator: RoboticsSimulatorBridge,
    options: RuntimePhysicsEngineOptions = {},
  ) {
    this.fixedStepMs = Math.max(1, Number(options.fixedStepMs) || DEFAULT_PHYSICS_STEP_MS);
    this.maxStepIterations = Math.max(10, Number(options.maxStepIterations) || 5000);
  }

  getFixedStepMs(): number {
    return this.fixedStepMs;
  }

  sample(): SimulatorTickOutput {
    return this.simulator.tick({
      dt_ms: 0,
      linear_velocity_cm_s: 0,
      angular_velocity_deg_s: 0,
    });
  }

  tickForDuration(
    totalMs: number,
    linearVelocityCmS: number,
    angularVelocityDegS: number,
  ): { collisions: Set<string> } {
    let remaining = Math.max(0, totalMs);
    const collisions = new Set<string>();
    let iterations = 0;
    while (remaining > 0.0001 && iterations < this.maxStepIterations) {
      const step = Math.min(this.fixedStepMs, remaining);
      const result = this.simulator.tick({
        dt_ms: step,
        linear_velocity_cm_s: linearVelocityCmS,
        angular_velocity_deg_s: angularVelocityDegS,
      });
      result.collisions.forEach((id) => collisions.add(id));
      remaining -= step;
      iterations += 1;
    }
    return { collisions };
  }

  startDistanceMove(input: StartDistanceMoveInput): ActiveDistanceMoveState {
    const start = this.sample();
    return {
      nodeId: input.nodeId,
      remainingCm: input.distanceCm,
      targetLinearCmS: input.targetLinearCmS,
      previousPosition: { ...start.pose.position },
      elapsedMs: 0,
      maxDurationMs: input.maxDurationMs,
      collisions: new Set<string>(),
    };
  }

  progressDistanceMove(input: ProgressDistanceMoveInput): ProgressDistanceMoveResult {
    const move = input.state;
    let remainingBudgetMs = Math.max(this.fixedStepMs, input.budgetMs);

    while (
      remainingBudgetMs > 0 &&
      move.remainingCm > 0 &&
      (input.collisionPolicy !== "timeout_then_continue" || move.elapsedMs < move.maxDurationMs)
    ) {
      const step = Math.min(this.fixedStepMs, remainingBudgetMs);
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
    let hasCollisionError = false;
    if (!done) {
      if (input.collisionPolicy === "abort_on_collision" && move.collisions.size > 0) {
        done = true;
      } else if (input.collisionPolicy === "timeout_then_continue" && move.elapsedMs >= move.maxDurationMs) {
        done = true;
      } else if (input.collisionPolicy === "error_on_collision" && move.collisions.size > 0) {
        done = true;
        hasCollisionError = true;
      }
    }

    return {
      done,
      hasCollisionError,
      state: move,
    };
  }

  startTurnMove(input: StartTurnMoveInput): ActiveTurnMoveState {
    const start = this.sample();
    return {
      nodeId: input.nodeId,
      targetAngleDeg: Math.max(0, input.targetAngleDeg),
      turnedDeg: 0,
      startHeadingDeg: start.pose.heading_deg,
      lastHeadingDeg: start.pose.heading_deg,
      targetAngularDegS: input.targetAngularDegS,
      targetLinearCmS: Number(input.targetLinearCmS) || 0,
      elapsedMs: 0,
      maxDurationMs: Math.max(200, input.maxDurationMs),
    };
  }

  progressTurnMove(input: ProgressTurnMoveInput): ProgressTurnMoveResult {
    const turn = input.state;
    let remainingBudgetMs = Math.max(this.fixedStepMs, input.budgetMs);
    let iterations = 0;
    while (
      remainingBudgetMs > 0 &&
      turn.turnedDeg < turn.targetAngleDeg &&
      turn.elapsedMs < turn.maxDurationMs &&
      iterations < this.maxStepIterations
    ) {
      const step = Math.min(this.fixedStepMs, remainingBudgetMs);
      this.simulator.tick({
        dt_ms: step,
        linear_velocity_cm_s: turn.targetLinearCmS,
        angular_velocity_deg_s: turn.targetAngularDegS,
      });
      const sample = this.sample();
      const delta = normalizeSignedAngle(sample.pose.heading_deg - turn.lastHeadingDeg);
      turn.turnedDeg += Math.abs(delta);
      turn.lastHeadingDeg = sample.pose.heading_deg;
      turn.elapsedMs += step;
      remainingBudgetMs -= step;
      iterations += 1;
    }
    return {
      done: turn.turnedDeg >= turn.targetAngleDeg || turn.elapsedMs >= turn.maxDurationMs,
      state: turn,
    };
  }

  snapTurnHeading(state: ActiveTurnMoveState): void {
    const sample = this.sample();
    const directionSign = state.targetAngularDegS >= 0 ? 1 : -1;
    const targetHeading = normalizeHeading(state.startHeadingDeg + directionSign * state.targetAngleDeg);
    this.simulator.reset({
      position: { ...sample.pose.position },
      heading_deg: targetHeading,
    });
  }

  settle(totalMs = 120): { collisions: Set<string> } {
    return this.tickForDuration(totalMs, 0, 0);
  }
}

function normalizeSignedAngle(delta: number): number {
  return ((delta + 540) % 360) - 180;
}

function normalizeHeading(heading: number): number {
  let next = heading % 360;
  if (next < 0) next += 360;
  return next;
}

