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
    expect(executor.getTrace()).toHaveLength(4);
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
    const result = executor.step();

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
    const result = executor.step();
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
});
