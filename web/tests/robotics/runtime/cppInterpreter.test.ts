import { describe, expect, it } from "vitest";
import { interpretTextProgram } from "../../../src/labs/robotics/runtime/textInterpreter";

describe("c++ interpreter", () => {
  it("parses supported C++ robotics commands into IR", () => {
    const source = `
int main() {
  robot.move("forward", 40, 80);
  robot.turn("right", 90, 60);
  robot.wait(0.2);
}
`;
    const result = interpretTextProgram(source, "cpp");
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.program.nodes.map((node) => node.kind)).toEqual(["move", "turn", "wait"]);
  });

  it("parses C++ functions and call sites into IR", () => {
    const source = `
void spin() {
  robot.wait(0.1);
}

int main() {
  spin();
}
`;
    const result = interpretTextProgram(source, "cpp");
    expect(result.ok).toBe(true);
    expect(result.program.nodes.map((node) => node.kind)).toEqual(["call"]);
    expect(result.program.functions?.map((fn) => fn.name)).toEqual(["spin"]);
  });

  it("parses while/if control flow", () => {
    const source = `
int main() {
  while (robot.read_sensor("distance") > 10) {
    robot.move("forward", 10, 60);
  }
  if (robot.read_sensor("distance") < 5) {
    robot.wait(0.1);
  } else {
    robot.turn("left", 45, 70);
  }
}
`;
    const result = interpretTextProgram(source, "cpp");
    expect(result.ok).toBe(true);
    expect(result.program.nodes.map((node) => node.kind)).toEqual(["repeat", "if"]);
  });

  it("returns diagnostics for unsupported statements", () => {
    const source = `
int main() {
  robot.fly(100);
}
`;
    const result = interpretTextProgram(source, "cpp");
    expect(result.ok).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("parses return statements in C++ functions", () => {
    const source = `
int helper() {
  return 5;
}

int main() {
  helper();
}
`;
    const result = interpretTextProgram(source, "cpp");
    expect(result.ok).toBe(true);
    expect(result.program.nodes.map((node) => node.kind)).toEqual(["call"]);
    expect(result.program.functions?.[0]?.body?.map((node) => node.kind)).toEqual(["return"]);
  });

  it("parses arithmetic expressions in C++ assignments", () => {
    const source = `
int main() {
  int value = 10 - 2 * 3;
}
`;
    const result = interpretTextProgram(source, "cpp");
    expect(result.ok).toBe(true);
    expect(result.program.nodes[0]).toMatchObject({
      kind: "assign",
      variable: "value",
      value: {
        type: "binary",
      },
    });
  });

  it("parses arithmetic call arguments in C++", () => {
    const source = `
int apply(int v) {
  return v;
}

int main() {
  apply(8 / 2);
}
`;
    const result = interpretTextProgram(source, "cpp");
    expect(result.ok).toBe(true);
    expect(result.program.nodes[0]).toMatchObject({
      kind: "call",
      args: [{ type: "binary", op: "div" }],
    });
  });

  it("parses >= and != conditions in C++", () => {
    const source = `
int main() {
  if (robot.read_sensor("distance") >= 10) {
    robot.wait(0.1);
  }
  if (robot.read_sensor("distance") != 0) {
    robot.wait(0.2);
  }
}
`;
    const result = interpretTextProgram(source, "cpp");
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

  it("respects parentheses in C++ arithmetic expressions", () => {
    const source = `
int main() {
  int value = (2 + 3) * 4;
}
`;
    const result = interpretTextProgram(source, "cpp");
    expect(result.ok).toBe(true);
    expect(result.program.nodes[0]).toMatchObject({
      kind: "assign",
      value: { type: "binary", op: "mul" },
    });
  });

  it("applies operator precedence in C++ arithmetic expressions", () => {
    const source = `
int main() {
  int value = 2 + 3 * 4;
}
`;
    const result = interpretTextProgram(source, "cpp");
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

  it("rejects chained comparisons in C++ conditions", () => {
    const source = `
int main() {
  if (10 < robot.read_sensor("distance") < 30) {
    robot.wait(0.1);
  }
}
`;
    const result = interpretTextProgram(source, "cpp");
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((line) => line.includes("chained comparisons are not supported in C++"))).toBe(true);
  });

  it("rejects chained <= and >= comparisons in C++ conditions", () => {
    const source = `
int main() {
  if (10 <= robot.read_sensor("distance") <= 30) {
    robot.wait(0.1);
  }
}
`;
    const result = interpretTextProgram(source, "cpp");
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((line) => line.includes("chained comparisons are not supported in C++"))).toBe(true);
  });

  it("reports precise diagnostics for unsupported C++ comparison chains", () => {
    const source = `
int main() {
  if (1 < 2 < 3) {
    robot.wait(0.1);
  }
}
`;
    const result = interpretTextProgram(source, "cpp");
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((line) => line.includes("chained comparisons are not supported in C++"))).toBe(true);
    expect(result.issues?.[0]).toMatchObject({
      severity: "error",
      category: "semantic",
      code: "CPP_UNSUPPORTED_CONSTRUCT",
    });
  });

  it("reports kit capability mismatch for unsupported sensors during parse", () => {
    const source = `
int main() {
  int d = robot.read_sensor("distance");
}
`;
    const result = interpretTextProgram(source, "cpp", { allowedSensors: ["gyro"] });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((line) => line.includes("is not available for the selected kit"))).toBe(true);
    expect(result.issues.some((issue) => issue.code === "KIT_CAPABILITY_MISMATCH")).toBe(true);
  });

  it("reports kit capability mismatch for unsupported sensors in conditions", () => {
    const source = `
int main() {
  if (robot.read_sensor("distance") > 10) {
    robot.wait(0.1);
  }
}
`;
    const result = interpretTextProgram(source, "cpp", { allowedSensors: ["gyro"] });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((line) => line.includes("is not available for the selected kit"))).toBe(true);
    expect(result.issues.some((issue) => issue.code === "KIT_CAPABILITY_MISMATCH")).toBe(true);
  });
});
