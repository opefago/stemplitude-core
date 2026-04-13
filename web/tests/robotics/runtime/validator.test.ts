import { describe, expect, it } from "vitest";
import type { RoboticsProgram } from "../../../src/lib/robotics/types";
import type { KitCapabilities } from "../../../src/labs/robotics/adapters/kitCapabilitiesFactory";
import type { KitRuntimeBehaviorProfile } from "../../../src/labs/robotics/adapters/kitRuntimeBehaviorFactory";
import { validateProgramForKit } from "../../../src/labs/robotics/runtime/validator";

const capabilities: KitCapabilities = {
  sensors: [
    { kind: "distance", label: "Distance", override: { type: "number" } },
    { kind: "gyro", label: "Gyro", override: { type: "none" } },
  ],
  actuators: [{ kind: "left_motor", label: "Left Motor" }],
};

const runtimeBehavior: KitRuntimeBehaviorProfile = {
  maxLinearSpeedCmS: 25,
  maxTurnSpeedDegS: 120,
  motorBehaviors: {
    left_motor: { mode: "turn", axisSign: -1, maxSpeed: 120 },
  },
};

describe("validateProgramForKit", () => {
  it("accepts valid kit-compatible programs", () => {
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [
        { id: "n1", kind: "read_sensor", sensor: "distance", output_var: "d" },
        { id: "n2", kind: "set_motor", motor_id: "left_motor", speed_pct: 60, duration_sec: 0.5 },
      ],
    };
    const result = validateProgramForKit({
      program,
      capabilities,
      runtimeBehavior,
      resolveActuatorAction: null,
    });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects unsupported sensors and actuators", () => {
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [
        { id: "n1", kind: "read_sensor", sensor: "color", output_var: "c" },
        { id: "n2", kind: "set_motor", motor_id: "arm_motor", speed_pct: 60, duration_sec: 0.5 },
      ],
    };
    const result = validateProgramForKit({
      program,
      capabilities,
      runtimeBehavior,
      resolveActuatorAction: null,
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((line) => line.includes('sensor "color"'))).toBe(true);
    expect(result.diagnostics.some((line) => line.includes('actuator "arm_motor"'))).toBe(true);
    expect(result.issues?.some((issue) => issue.code === "KIT_CAPABILITY_MISMATCH")).toBe(true);
  });

  it("validates return expression sensor usage", () => {
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [{ id: "n1", kind: "wait", seconds: 0.1 }],
      functions: [
        {
          id: "f",
          name: "f",
          params: [],
          body: [{ id: "f1", kind: "return", value: { type: "sensor", sensor: "color" } }],
        },
      ],
    };
    const result = validateProgramForKit({
      program,
      capabilities,
      runtimeBehavior,
      resolveActuatorAction: null,
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((line) => line.includes('sensor "color"'))).toBe(true);
  });

  it("validates sensor usage inside arithmetic expressions", () => {
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
            left: { type: "sensor", sensor: "color" },
            right: { type: "number", value: 1 },
          },
        },
      ],
    };
    const result = validateProgramForKit({
      program,
      capabilities,
      runtimeBehavior,
      resolveActuatorAction: null,
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((line) => line.includes('sensor "color"'))).toBe(true);
  });

  it("validates sensor usage inside call argument expressions", () => {
    const program: RoboticsProgram = {
      version: 1,
      entrypoint: "main",
      nodes: [
        {
          id: "n1",
          kind: "call",
          function_id: "f",
          args: [
            {
              type: "binary",
              op: "add",
              left: { type: "sensor", sensor: "color" },
              right: { type: "number", value: 1 },
            },
          ],
        },
      ],
      functions: [{ id: "f", name: "f", params: ["x"], body: [] }],
    };
    const result = validateProgramForKit({
      program,
      capabilities,
      runtimeBehavior,
      resolveActuatorAction: null,
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((line) => line.includes('sensor "color"'))).toBe(true);
  });
});

