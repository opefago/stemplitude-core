import { describe, expect, it } from "vitest";
import { interpretTextProgram } from "../../../src/labs/robotics/runtime/textInterpreter";

describe("python interpreter", () => {
  it("parses supported Python robotics commands into IR", () => {
    const source = `
def main():
  robot.move_forward(80, speed_pct=70)
  robot.turn_left(90, speed_pct=75)
  if robot.read_sensor("distance") > 15:
    robot.wait(0.5)
`;
    const result = interpretTextProgram(source, "python");
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.program.nodes.map((node) => node.kind)).toEqual(["move", "turn", "if"]);
  });

  it("parses Python function definitions and call nodes", () => {
    const source = `
def spin():
  robot.wait(0.1)

spin()
`;
    const result = interpretTextProgram(source, "python");
    expect(result.ok).toBe(true);
    expect(result.program.nodes.map((node) => node.kind)).toEqual(["call"]);
    expect(result.program.functions?.map((fn) => fn.name)).toEqual(["spin"]);
  });

  it("handles for-range with start/end/step", () => {
    const source = `
for i in range(1, 6, 2):
  robot.wait(0.1)
`;
    const result = interpretTextProgram(source, "python");
    expect(result.ok).toBe(true);
    expect(result.program.nodes[0]).toMatchObject({
      kind: "repeat",
      times: 2,
    });
  });

  it("keeps parsing sensor assignment with single-quoted read_sensor", () => {
    const source = `
distance_value = robot.read_sensor('distance')
`;
    const result = interpretTextProgram(source, "python");
    expect(result.ok).toBe(true);
    expect(result.program.nodes[0]).toMatchObject({
      kind: "assign",
      variable: "distance_value",
    });
  });

  it("returns diagnostics for unsupported statements", () => {
    const source = `
robot.fly(100)
`;
    const result = interpretTextProgram(source, "python");
    expect(result.ok).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("parses return statements in Python functions", () => {
    const source = `
def compute():
  return 7

compute()
`;
    const result = interpretTextProgram(source, "python");
    expect(result.ok).toBe(true);
    expect(result.program.nodes.map((node) => node.kind)).toEqual(["call"]);
    expect(result.program.functions?.[0]?.body?.map((node) => node.kind)).toEqual(["return"]);
  });

  it("parses arithmetic expressions in Python assignments", () => {
    const source = `
value = 2 + 3 * 4
`;
    const result = interpretTextProgram(source, "python");
    expect(result.ok).toBe(true);
    expect(result.program.nodes[0]).toMatchObject({
      kind: "assign",
      variable: "value",
      value: {
        type: "binary",
      },
    });
  });

  it("parses arithmetic call arguments in Python", () => {
    const source = `
def apply(v):
  return v

apply(2 + 3)
`;
    const result = interpretTextProgram(source, "python");
    expect(result.ok).toBe(true);
    expect(result.program.nodes[0]).toMatchObject({
      kind: "call",
      args: [{ type: "binary", op: "add" }],
    });
  });

  it("parses >= and != conditions in Python", () => {
    const source = `
if robot.read_sensor("distance") >= 10:
  robot.wait(0.1)

if robot.read_sensor("distance") != 0:
  robot.wait(0.2)
`;
    const result = interpretTextProgram(source, "python");
    expect(result.ok).toBe(true);
    expect(result.program.nodes[0]).toMatchObject({
      kind: "if",
      condition: { op: "not", condition: { op: "sensor_lt", sensor: "distance", value: 10 } },
    });
    expect(result.program.nodes[1]).toMatchObject({
      kind: "if",
      condition: { op: "not" },
    });
  });

  it("respects parentheses in Python arithmetic expressions", () => {
    const source = `
value = (2 + 3) * 4
`;
    const result = interpretTextProgram(source, "python");
    expect(result.ok).toBe(true);
    expect(result.program.nodes[0]).toMatchObject({
      kind: "assign",
      value: { type: "binary", op: "mul" },
    });
  });

  it("applies operator precedence in Python arithmetic expressions", () => {
    const source = `
value = 2 + 3 * 4
`;
    const result = interpretTextProgram(source, "python");
    expect(result.ok).toBe(true);
    expect(result.program.nodes[0]).toMatchObject({
      kind: "assign",
      value: {
        type: "binary",
        op: "add",
        left: { type: "number", value: 2 },
        right: { type: "binary", op: "mul" },
      },
    });
  });

  it("parses chained comparisons in Python conditions", () => {
    const source = `
if 10 < robot.read_sensor("distance") < 30:
  robot.wait(0.1)
`;
    const result = interpretTextProgram(source, "python");
    expect(result.ok).toBe(true);
    expect(result.program.nodes[0]).toMatchObject({
      kind: "if",
      condition: {
        op: "and",
        conditions: [
          { op: "sensor_gt", sensor: "distance", value: 10 },
          { op: "sensor_lt", sensor: "distance", value: 30 },
        ],
      },
    });
  });

  it("parses chained <= and >= comparisons in Python conditions", () => {
    const source = `
if 10 <= robot.read_sensor("distance") <= 30:
  robot.wait(0.1)
`;
    const result = interpretTextProgram(source, "python");
    expect(result.ok).toBe(true);
    expect(result.program.nodes[0]).toMatchObject({
      kind: "if",
      condition: {
        op: "and",
        conditions: [
          { op: "not", condition: { op: "sensor_lt", sensor: "distance", value: 10 } },
          { op: "not", condition: { op: "sensor_gt", sensor: "distance", value: 30 } },
        ],
      },
    });
  });

  it("reports precise diagnostics for unsupported Python comparison chains", () => {
    const source = `
if 1 < 2 < 3:
  robot.wait(0.1)
`;
    const result = interpretTextProgram(source, "python");
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((line) => line.includes("sensor-to-number threshold"))).toBe(true);
    expect(result.issues?.[0]).toMatchObject({
      severity: "error",
      category: "syntax",
      code: "UNSUPPORTED_SYNTAX",
    });
  });
});
