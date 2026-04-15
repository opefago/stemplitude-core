import { describe, expect, it } from "vitest";
import type { RoboticsProgram } from "../../../src/lib/robotics/types";
import type {
  RoboticsSimulatorBridge,
  SimulatorPose2D,
  SimulatorTickInput,
  SimulatorTickOutput,
} from "../../../src/labs/robotics/simulator/types";
import type { KitActuatorActionHandler } from "../../../src/labs/robotics/adapters/kitActuatorActionFactory";
import type { KitRuntimeBehaviorProfile } from "../../../src/labs/robotics/adapters/kitRuntimeBehaviorFactory";
import { IRRuntimeExecutor } from "../../../src/labs/robotics/runtime/executor";

class MockSimulator implements RoboticsSimulatorBridge {
  private pose: SimulatorPose2D = { position: { x: 0, y: 0 }, heading_deg: 0 };

  setWorld(): void {}

  reset(pose: SimulatorPose2D): void {
    this.pose = {
      position: { ...pose.position },
      heading_deg: pose.heading_deg,
    };
  }

  tick(input: SimulatorTickInput): SimulatorTickOutput {
    const dtSeconds = input.dt_ms / 1000;
    const headingRad = (this.pose.heading_deg * Math.PI) / 180;
    this.pose = {
      position: {
        x: this.pose.position.x + Math.cos(headingRad) * input.linear_velocity_cm_s * dtSeconds,
        y: this.pose.position.y + Math.sin(headingRad) * input.linear_velocity_cm_s * dtSeconds,
      },
      heading_deg: (this.pose.heading_deg + input.angular_velocity_deg_s * dtSeconds + 360) % 360,
    };
    return {
      pose: {
        position: { ...this.pose.position },
        heading_deg: this.pose.heading_deg,
      },
      collisions: [],
      sensor_values: { distance: 42, gyro: this.pose.heading_deg },
    };
  }

  getPose(): SimulatorPose2D {
    return {
      position: { ...this.pose.position },
      heading_deg: this.pose.heading_deg,
    };
  }
}

class BlockingCollisionSimulator implements RoboticsSimulatorBridge {
  private pose: SimulatorPose2D = { position: { x: 0, y: 0 }, heading_deg: 0 };

  setWorld(): void {}

  reset(pose: SimulatorPose2D): void {
    this.pose = {
      position: { ...pose.position },
      heading_deg: pose.heading_deg,
    };
  }

  tick(input: SimulatorTickInput): SimulatorTickOutput {
    const isTryingToMove = Math.abs(input.linear_velocity_cm_s) > 0.001;
    return {
      pose: {
        position: { ...this.pose.position },
        heading_deg: this.pose.heading_deg,
      },
      collisions: isTryingToMove ? ["wall_1"] : [],
      sensor_values: { distance: 0, gyro: this.pose.heading_deg },
    };
  }

  getPose(): SimulatorPose2D {
    return {
      position: { ...this.pose.position },
      heading_deg: this.pose.heading_deg,
    };
  }
}

describe("IRRuntimeExecutor", () => {
  it("executes program nodes and reaches completed state", () => {
    const simulator = new MockSimulator();
    const executor = new IRRuntimeExecutor(simulator);
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [
        { id: "n1", kind: "move", direction: "forward", unit: "distance_cm", value: 20, speed_pct: 100 },
        { id: "n2", kind: "turn", direction: "right", angle_deg: 90, speed_pct: 100 },
        { id: "n3", kind: "wait", seconds: 0.1 },
        { id: "n4", kind: "read_sensor", sensor: "distance", output_var: "dist" },
      ],
    };

    executor.load(program);
    executor.run();
    let result = executor.step();
    while (result.state === "running") {
      result = executor.step();
    }

    expect(result.state).toBe("completed");
    expect(executor.getTrace().length).toBeGreaterThanOrEqual(4);
  });

  it("executes call nodes against declared functions", () => {
    const simulator = new MockSimulator();
    const executor = new IRRuntimeExecutor(simulator);
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [{ id: "n1", kind: "call", function_id: "spin_loop", args: [] }],
      functions: [{ id: "spin_loop", name: "spin_loop", params: [], body: [{ id: "f1", kind: "wait", seconds: 0.1 }] }],
    };

    executor.load(program);
    executor.run();
    let result = executor.step();
    let guard = 0;
    while (result.state === "running" && guard < 40) {
      result = executor.step();
      guard += 1;
    }

    expect(result.state).toBe("completed");
    expect(result.diagnostics || []).toHaveLength(0);
  });

  it("fails when a called function does not exist", () => {
    const simulator = new MockSimulator();
    const executor = new IRRuntimeExecutor(simulator);
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [{ id: "n1", kind: "call", function_id: "missing_function", args: [] }],
      functions: [],
    };

    executor.load(program);
    executor.run();
    const result = executor.step();

    expect(result.state).toBe("error");
    expect(result.diagnostics?.some((line) => line.includes("call unresolved"))).toBe(true);
    expect(result.issues?.some((issue) => issue.code === "CALL_UNRESOLVED")).toBe(true);
  });

  it("applies kit runtime behavior mapping for set_motor actions", () => {
    const simulator = new MockSimulator();
    const behavior: KitRuntimeBehaviorProfile = {
      maxLinearSpeedCmS: 30,
      maxTurnSpeedDegS: 140,
      motorBehaviors: {
        drive: { mode: "linear", axisSign: 1, maxSpeed: 30, defaultDurationSec: 1 },
      },
    };
    const executor = new IRRuntimeExecutor(simulator, behavior);
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [{ id: "n1", kind: "set_motor", motor_id: "drive", speed_pct: 100, duration_sec: 1 }],
    };

    executor.load(program);
    executor.run();
    const result = executor.step();

    expect(result.state).toBe("completed");
    expect(result.diagnostics || []).toEqual([]);
    expect(simulator.getPose().position.x).toBeGreaterThan(0);
  });

  it("executes registered actuator actions for custom nodes", () => {
    const simulator = new MockSimulator();
    const behavior: KitRuntimeBehaviorProfile = {
      maxLinearSpeedCmS: 30,
      maxTurnSpeedDegS: 140,
      motorBehaviors: {},
    };
    const resolver = (actuatorId: string, action: string): KitActuatorActionHandler | null => {
      if (actuatorId === "gripper" && action === "open") {
        return (_request, context) => {
          context.tickForDuration(500, 20, 0);
          return { handled: true };
        };
      }
      return null;
    };
    const executor = new IRRuntimeExecutor(simulator, behavior, resolver);
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [{ id: "n1", kind: "actuator_action", actuator_id: "gripper", action: "open" }],
    };

    executor.load(program);
    executor.run();
    const result = executor.step();

    expect(result.state).toBe("completed");
    expect(result.diagnostics || []).toEqual([]);
    expect(simulator.getPose().position.x).toBeGreaterThan(0);
  });

  it("keeps function-local assignments scoped to the call frame", () => {
    const simulator = new MockSimulator();
    const executor = new IRRuntimeExecutor(simulator);
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [
        { id: "n1", kind: "assign", variable: "x", value: { type: "number", value: 1 } },
        { id: "n2", kind: "call", function_id: "mutate", args: [] },
        {
          id: "n3",
          kind: "if",
          condition: {
            op: "eq",
            left: { type: "var", name: "x" },
            right: { type: "number", value: 1 },
          },
          then_nodes: [{ id: "n3_then", kind: "wait", seconds: 0.1 }],
          else_nodes: [{ id: "n3_else", kind: "call", function_id: "missing", args: [] }],
        },
      ],
      functions: [
        {
          id: "mutate",
          name: "mutate",
          params: [],
          body: [{ id: "f1", kind: "assign", variable: "x", value: { type: "number", value: 999 } }],
        },
      ],
    };
    executor.load(program);
    executor.run();
    let result = executor.step();
    while (result.state === "running") {
      result = executor.step();
    }
    expect(result.state).toBe("completed");
  });

  it("honors return statements by exiting function early", () => {
    const simulator = new MockSimulator();
    const executor = new IRRuntimeExecutor(simulator);
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [{ id: "n1", kind: "call", function_id: "early_exit", args: [] }],
      functions: [
        {
          id: "early_exit",
          name: "early_exit",
          params: [],
          body: [
            { id: "f1", kind: "return" },
            { id: "f2", kind: "call", function_id: "missing", args: [] },
          ],
        },
      ],
    };
    executor.load(program);
    executor.run();
    let result = executor.step();
    let guard = 0;
    while (result.state === "running" && guard < 40) {
      result = executor.step();
      guard += 1;
    }
    expect(result.state).toBe("completed");
    expect(result.diagnostics || []).toEqual([]);
  });

  it("evaluates arithmetic expressions in assign and conditions", () => {
    const simulator = new MockSimulator();
    const executor = new IRRuntimeExecutor(simulator);
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [
        {
          id: "n1",
          kind: "assign",
          variable: "x",
          value: {
            type: "binary",
            op: "add",
            left: { type: "number", value: 2 },
            right: {
              type: "binary",
              op: "mul",
              left: { type: "number", value: 3 },
              right: { type: "number", value: 4 },
            },
          },
        },
        {
          id: "n2",
          kind: "if",
          condition: {
            op: "eq",
            left: { type: "var", name: "x" },
            right: { type: "number", value: 14 },
          },
          then_nodes: [{ id: "n2_then", kind: "wait", seconds: 0.1 }],
          else_nodes: [{ id: "n2_else", kind: "call", function_id: "missing", args: [] }],
        },
      ],
    };
    executor.load(program);
    executor.run();
    let result = executor.step();
    while (result.state === "running") {
      result = executor.step();
    }
    expect(result.state).toBe("completed");
  });

  it("evaluates call argument expressions at call time", () => {
    const simulator = new MockSimulator();
    const executor = new IRRuntimeExecutor(simulator);
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [{ id: "n1", kind: "call", function_id: "check", args: [{ type: "binary", op: "add", left: { type: "number", value: 5 }, right: { type: "number", value: 7 } }] }],
      functions: [
        {
          id: "check",
          name: "check",
          params: ["x"],
          body: [
            {
              id: "f1",
              kind: "if",
              condition: {
                op: "eq",
                left: { type: "var", name: "x" },
                right: { type: "number", value: 12 },
              },
              then_nodes: [{ id: "f1_then", kind: "wait", seconds: 0.1 }],
              else_nodes: [{ id: "f1_else", kind: "call", function_id: "missing", args: [] }],
            },
          ],
        },
      ],
    };
    executor.load(program);
    executor.run();
    let result = executor.step();
    while (result.state === "running") {
      result = executor.step();
    }
    expect(result.state).toBe("completed");
  });

  it("reaches commanded move distance regardless of speed_pct", () => {
    const fastSimulator = new MockSimulator();
    const slowSimulator = new MockSimulator();
    const fastExecutor = new IRRuntimeExecutor(fastSimulator);
    const slowExecutor = new IRRuntimeExecutor(slowSimulator);

    const fastProgram: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [{ id: "n1", kind: "move", direction: "forward", unit: "distance_cm", value: 80, speed_pct: 100 }],
    };
    const slowProgram: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [{ id: "n1", kind: "move", direction: "forward", unit: "distance_cm", value: 80, speed_pct: 1 }],
    };

    fastExecutor.load(fastProgram);
    fastExecutor.run();
    let fastResult = fastExecutor.step();
    let fastSteps = 1;
    while (fastResult.state === "running" && fastSteps < 5000) {
      fastResult = fastExecutor.step();
      fastSteps += 1;
    }

    slowExecutor.load(slowProgram);
    slowExecutor.run();
    let slowResult = slowExecutor.step();
    let slowSteps = 1;
    while (slowResult.state === "running" && slowSteps < 5000) {
      slowResult = slowExecutor.step();
      slowSteps += 1;
    }

    expect(fastResult.state).toBe("completed");
    expect(slowResult.state).toBe("completed");
    expect(slowSteps).toBeGreaterThan(fastSteps);
    const fastX = fastSimulator.getPose().position.x;
    const slowX = slowSimulator.getPose().position.x;
    expect(fastX).toBeCloseTo(80, 2);
    expect(slowX).toBeCloseTo(80, 2);
    expect(Math.abs(fastX - slowX)).toBeLessThan(0.8);
  });

  it("snaps completed turn commands to exact target heading", () => {
    const simulator = new MockSimulator();
    const executor = new IRRuntimeExecutor(simulator);
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [
        { id: "t1", kind: "turn", direction: "left", angle_deg: 90, speed_pct: 100 },
        { id: "t2", kind: "turn", direction: "left", angle_deg: 90, speed_pct: 100 },
        { id: "t3", kind: "turn", direction: "left", angle_deg: 90, speed_pct: 100 },
        { id: "t4", kind: "turn", direction: "left", angle_deg: 90, speed_pct: 100 },
      ],
    };
    executor.load(program);
    executor.run();
    let result = executor.step();
    let guard = 0;
    while (result.state === "running" && guard < 300) {
      result = executor.step();
      guard += 1;
    }
    expect(result.state).toBe("completed");
    expect(simulator.getPose().heading_deg).toBeCloseTo(0, 6);
  });

  it("does not fast-forward static repeat loops in a single tick", () => {
    const simulator = new MockSimulator();
    const executor = new IRRuntimeExecutor(simulator);
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [
        {
          id: "repeat_1",
          kind: "repeat",
          times: 4,
          body: [
            { id: "move_1", kind: "move", direction: "forward", unit: "distance_cm", value: 80, speed_pct: 100 },
            { id: "turn_1", kind: "turn", direction: "left", angle_deg: 90, speed_pct: 75 },
          ],
        },
      ],
    };
    executor.load(program);
    executor.run();
    const first = executor.step(200);
    expect(first.state).toBe("running");
    let result = first;
    let guard = 0;
    while (result.state === "running" && guard < 800) {
      result = executor.step(200);
      guard += 1;
    }
    expect(result.state).toBe("completed");
    expect(guard).toBeGreaterThan(8);
  });

  it("does not fast-forward conditional branches in a single tick", () => {
    const simulator = new MockSimulator();
    const executor = new IRRuntimeExecutor(simulator);
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [
        {
          id: "if_1",
          kind: "if",
          condition: {
            op: "eq",
            left: { type: "number", value: 1 },
            right: { type: "number", value: 1 },
          },
          then_nodes: [
            { id: "m1", kind: "move", direction: "forward", unit: "distance_cm", value: 80, speed_pct: 100 },
            { id: "t1", kind: "turn", direction: "left", angle_deg: 90, speed_pct: 75 },
          ],
          else_nodes: [],
        },
      ],
    };
    executor.load(program);
    executor.run();
    const first = executor.step(200);
    expect(first.state).toBe("running");
    expect(first.highlightedNodeId).toBe("if_1");
    const second = executor.step(200);
    expect(second.state).toBe("running");
    expect(second.highlightedNodeId).toContain("m1");
  });

  it("holds move state on collision by default until distance is reached", () => {
    const simulator = new BlockingCollisionSimulator();
    const executor = new IRRuntimeExecutor(simulator);
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [
        { id: "move_1", kind: "move", direction: "forward", unit: "distance_cm", value: 80, speed_pct: 100 },
        { id: "turn_1", kind: "turn", direction: "right", angle_deg: 90, speed_pct: 100 },
      ],
    };

    executor.load(program);
    executor.run();
    let result = executor.step();
    for (let i = 0; i < 30; i += 1) {
      result = executor.step();
    }

    expect(result.state).toBe("running");
    expect(result.highlightedNodeId).toBe("move_1");
    expect(simulator.getPose().position.x).toBe(0);
  });

  it("can abort move and continue when collision policy is configured", () => {
    const simulator = new BlockingCollisionSimulator();
    const executor = new IRRuntimeExecutor(simulator, undefined, null, {
      moveCollisionPolicy: "abort_on_collision",
    });
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [
        { id: "move_1", kind: "move", direction: "forward", unit: "distance_cm", value: 80, speed_pct: 100 },
        { id: "turn_1", kind: "turn", direction: "right", angle_deg: 90, speed_pct: 100 },
      ],
    };

    executor.load(program);
    executor.run();
    const first = executor.step();
    const second = executor.step();

    expect(first.highlightedNodeId).toBe("move_1");
    expect(second.highlightedNodeId).toBe("turn_1");
  });

  it("fails with call stack overflow on direct recursion", () => {
    const simulator = new MockSimulator();
    const executor = new IRRuntimeExecutor(simulator);
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [{ id: "n1", kind: "call", function_id: "recurse", args: [] }],
      functions: [
        {
          id: "recurse",
          name: "recurse",
          params: [],
          body: [{ id: "f1", kind: "call", function_id: "recurse", args: [] }],
        },
      ],
    };
    executor.load(program);
    executor.run();
    let result = executor.step({ policy: "step_over" });
    let guard = 0;
    while (result.state === "running" && guard < 2000) {
      result = executor.step({ policy: "step_over" });
      guard += 1;
    }
    expect(guard).toBeLessThan(2000);
    expect(result.state).toBe("error");
    expect(result.diagnostics?.some((line) => line.includes("call stack overflow"))).toBe(true);
    expect(result.issues.some((issue) => issue.code === "CALL_STACK_OVERFLOW")).toBe(true);
  });

  it("fails with call stack overflow on nested indirect recursion", () => {
    const simulator = new MockSimulator();
    const executor = new IRRuntimeExecutor(simulator);
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [{ id: "n1", kind: "call", function_id: "a", args: [] }],
      functions: [
        { id: "a", name: "a", params: [], body: [{ id: "a1", kind: "call", function_id: "b", args: [] }] },
        { id: "b", name: "b", params: [], body: [{ id: "b1", kind: "call", function_id: "a", args: [] }] },
      ],
    };
    executor.load(program);
    executor.run();
    let result = executor.step({ policy: "step_over" });
    let guard = 0;
    while (result.state === "running" && guard < 2000) {
      result = executor.step({ policy: "step_over" });
      guard += 1;
    }
    expect(guard).toBeLessThan(2000);
    expect(result.state).toBe("error");
    expect(result.issues.some((issue) => issue.code === "CALL_STACK_OVERFLOW")).toBe(true);
  });

  it("supports step_into and step_over semantics for function calls", () => {
    const simulator = new MockSimulator();
    const executor = new IRRuntimeExecutor(simulator);
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [{ id: "call_1", kind: "call", function_id: "spin_loop", args: [] }],
      functions: [{ id: "spin_loop", name: "spin_loop", params: [], body: [{ id: "f_wait", kind: "wait", seconds: 0.1 }] }],
    };
    executor.load(program);
    executor.run();
    const intoResult = executor.step({ policy: "step_into" });
    expect(intoResult.state).toBe("running");
    expect(intoResult.semanticEvent?.type).toBe("call_enter");

    const overExecutor = new IRRuntimeExecutor(new MockSimulator());
    overExecutor.load(program);
    overExecutor.run();
    let overResult = overExecutor.step({ policy: "step_over" });
    expect(overResult.semanticEvent?.type).toBe("call_enter");
    let guard = 0;
    while (overResult.state === "running" && overResult.semanticEvent?.type !== "call_return" && guard < 200) {
      overResult = overExecutor.step({ policy: "step_over" });
      guard += 1;
    }
    expect(guard).toBeLessThan(200);
    expect(overResult.semanticEvent?.type).toBe("call_return");
    while (overResult.state === "running" && guard < 400) {
      overResult = overExecutor.step({ policy: "step_over" });
      guard += 1;
    }
    expect(overResult.state).toBe("completed");
  });

  it("supports step_over semantics for repeat loops", () => {
    const simulator = new MockSimulator();
    const executor = new IRRuntimeExecutor(simulator);
    executor.load({
      version: 1,
      entrypoint: "main",
      nodes: [
        {
          id: "loop_1",
          kind: "repeat",
          times: 3,
          body: [{ id: "w1", kind: "wait", seconds: 0.05 }],
        },
        { id: "move_1", kind: "move", direction: "forward", unit: "distance_cm", value: 20, speed_pct: 60 },
      ],
    });
    executor.run();
    let result = executor.step({ policy: "step_over" });
    expect(result.semanticEvent?.type).toBe("loop_check");
    let guard = 0;
    while (result.state === "running" && result.semanticEvent?.type !== "loop_exit" && guard < 300) {
      result = executor.step({ policy: "step_over" });
      guard += 1;
    }
    expect(guard).toBeLessThan(300);
    expect(result.semanticEvent?.type).toBe("loop_exit");
    const next = executor.step({ policy: "step_over" });
    expect(next.highlightedNodeId).toBe("move_1");
  });
});
