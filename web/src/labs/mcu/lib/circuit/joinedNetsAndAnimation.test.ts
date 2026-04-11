import { describe, expect, it } from "vitest";
import { EnhancedCircuitSolver } from "./EnhancedCircuitSolver";
import { Battery } from "./components/Battery";
import { Resistor } from "./components/Resistor";
import { Ground } from "./components/Ground";
import { NotGate } from "./components/NotGate";
import { WireAnimationStabilizer } from "./rendering/WireAnimationStabilizer";
import { orderedComponentEndpointsForWire } from "./wireEndpointTopology";
import type { WireNode, WireSegment } from "./InteractiveWireSystem";

function comp(
  id: string,
  componentId: string,
  nodeId: string,
  x: number,
  y: number,
): WireNode {
  return {
    id,
    type: "component",
    x,
    y,
    componentId,
    nodeId,
    connectedWires: [],
  };
}

function junc(id: string, x: number, y: number): WireNode {
  return { id, type: "junction", x, y, connectedWires: [] };
}

describe("joined nets + wire animation helpers", () => {
  it("orderedComponentEndpointsForWire sorts pins along polyline when node list is reversed", () => {
    const seg: WireSegment[] = [
      {
        start: { x: 0, y: 0, layer: 0 },
        end: { x: 100, y: 0, layer: 0 },
        isHorizontal: true,
        layer: 0,
      },
    ];
    const late = comp("r2", "R", "terminal2", 80, 0);
    const early = comp("r1", "R", "terminal1", 10, 0);
    const wire = { nodes: [late, early], segments: seg };
    const { first, second } = orderedComponentEndpointsForWire(wire);
    expect(first?.nodeId).toBe("terminal1");
    expect(second?.nodeId).toBe("terminal2");
  });

  it("DC solve with T-junction rebuild sees both parallel resistors (interactive-style wire map)", () => {
    const solver = new EnhancedCircuitSolver();
    solver.addComponent(new Battery("BAT", 9, 0.5, 0, 0));
    solver.addComponent(new Resistor("R1", 1000, 0.25, 5, 0, 0));
    solver.addComponent(new Resistor("R2", 1000, 0.25, 5, 0, 0));
    solver.addComponent(new Ground("GND", "earth", 0, 0));

    /** Tee at top: BAT+ and both R inputs; bottom rail: R outputs, BAT-, GND. */
    const jTop = junc("jTop", 50, 0);
    const jBot = junc("jBot", 50, 40);

    const wires = new Map([
      ["w1", { nodes: [comp("a", "BAT", "positive", 0, 0), jTop] }],
      ["w2", { nodes: [jTop, comp("b", "R1", "terminal1", 30, 0)] }],
      ["w3", { nodes: [comp("c", "R1", "terminal2", 30, 40), jBot] }],
      ["w4", { nodes: [jTop, comp("d", "R2", "terminal1", 70, 0)] }],
      ["w5", { nodes: [comp("e", "R2", "terminal2", 70, 40), jBot] }],
      ["w6", { nodes: [comp("f", "BAT", "negative", 0, 40), jBot] }],
      ["w7", { nodes: [jBot, comp("g", "GND", "ground", 0, 50)] }],
    ]);

    solver.rebuildConnectionsFromInteractiveWires(wires, { gridPitchPx: 10 });
    expect(solver.solveDC()).toBe(true);
    const snap = solver.getSimulationSnapshot();
    const i1 = Math.abs(snap.componentTerminalCurrents.R1?.terminal1 ?? 0);
    const i2 = Math.abs(snap.componentTerminalCurrents.R2?.terminal1 ?? 0);
    expect(i1).toBeGreaterThan(1e-4);
    expect(i2).toBeGreaterThan(1e-4);
    expect(Math.abs(i1 - i2)).toBeLessThan(0.002);
  });

  it("WireAnimationStabilizer updates display current for a stub-scale signed solve", () => {
    const st = new WireAnimationStabilizer();
    const now = 1_000_000;
    st.step("wStub", 0.006, 0.016, now, false);
    expect(Math.abs(st.getDisplaySigned("wStub"))).toBeGreaterThan(1e-6);
  });

  it("stabilizer fade crosses particle energization band for branch-scale current", () => {
    const st = new WireAnimationStabilizer();
    let now = 0;
    for (let i = 0; i < 40; i++) {
      st.step("wBranch", 0.008, 0.016, now, false);
      now += 16;
    }
    expect(st.getFade01("wBranch")).toBeGreaterThan(0.05);
    expect(Math.abs(st.getDisplaySigned("wBranch"))).toBeGreaterThan(5e-4);
  });

  it("position merge ties duplicate junction ids near same point (grid-scaled radius)", () => {
    const solver = new EnhancedCircuitSolver();
    solver.addComponent(new Battery("BAT", 9, 0.5, 0, 0));
    solver.addComponent(new Resistor("R1", 1000, 0.25, 5, 0, 0));
    solver.addComponent(new Ground("GND", "earth", 0, 0));

    const ja = junc("ja", 100, 0);
    const jb = junc("jb", 102, 0);

    const wires = new Map([
      ["w1", { nodes: [comp("a", "BAT", "positive", 0, 0), ja] }],
      ["w2", { nodes: [jb, comp("b", "R1", "terminal1", 200, 0)] }],
      ["w3", { nodes: [comp("c", "R1", "terminal2", 200, 50), comp("d", "GND", "ground", 200, 60)] }],
      ["w4", { nodes: [comp("e", "BAT", "negative", 0, 50), comp("f", "GND", "ground", 0, 55)] }],
    ]);

    solver.rebuildConnectionsFromInteractiveWires(wires, { gridPitchPx: 10 });
    expect(solver.solveDC()).toBe(true);
    const mPlus = solver.getMergedNodeIndex("BAT", "positive");
    const mR1a = solver.getMergedNodeIndex("R1", "terminal1");
    expect(mPlus).toBeDefined();
    expect(mPlus).toBe(mR1a);
  });

  it("branch resistor is near-zero current when explicitly shorted by a direct wire", () => {
    const solver = new EnhancedCircuitSolver();
    solver.addComponent(new Battery("BAT", 9, 0.5, 0, 0));
    solver.addComponent(new Resistor("R1", 1000, 0.25, 5, 0, 0));
    solver.addComponent(new Resistor("R2", 1000, 0.25, 5, 0, 0));
    solver.addComponent(new Ground("GND", "earth", 0, 0));

    const jTop = junc("jTop", 80, 0);
    const jBot = junc("jBot", 80, 40);

    const wires = new Map([
      ["w1", { nodes: [comp("a", "BAT", "positive", 0, 0), comp("b", "R1", "terminal1", 20, 0)] }],
      ["w2", { nodes: [comp("c", "R1", "terminal2", 40, 0), jTop] }],
      ["w3", { nodes: [jTop, jBot] }], // Explicit short branch (vertical trunk)
      ["w4", { nodes: [comp("d", "R2", "terminal1", 110, 0), jTop] }],
      ["w5", { nodes: [comp("e", "R2", "terminal2", 110, 40), jBot] }],
      ["w6", { nodes: [comp("f", "BAT", "negative", 0, 40), jBot] }],
      ["w7", { nodes: [jBot, comp("g", "GND", "ground", 20, 40)] }],
    ]);

    solver.rebuildConnectionsFromInteractiveWires(wires, { gridPitchPx: 10 });
    expect(solver.solveDC()).toBe(true);
    const snap = solver.getSimulationSnapshot();
    const iR1 = Math.abs(snap.componentTerminalCurrents.R1?.terminal1 ?? 0);
    const iR2 = Math.abs(snap.componentTerminalCurrents.R2?.terminal1 ?? 0);

    expect(iR1).toBeGreaterThan(1e-4);
    expect(iR2).toBeLessThan(1e-6);
  });

  it("logic gate output is solver-active and drives resistor load current", () => {
    const solver = new EnhancedCircuitSolver();
    solver.addComponent(new Battery("BAT", 9, 0.5, 0, 0));
    solver.addComponent(new NotGate("INV", 0, 0));
    solver.addComponent(new Resistor("RLOAD", 1000, 0.25, 5, 0, 0));
    solver.addComponent(new Ground("GND", "earth", 0, 0));

    const jIn = junc("jIn", -20, 0);
    const jOut = junc("jOut", 40, 0);
    const jGnd = junc("jGnd", 0, 40);

    const wires = new Map([
      // Drive inverter input HIGH from battery so inverter output should go LOW.
      ["w1", { nodes: [comp("a", "BAT", "positive", -60, 0), jIn] }],
      ["w2", { nodes: [jIn, comp("b", "INV", "input", -30, 0)] }],

      // Output node and load.
      ["w3", { nodes: [comp("c", "INV", "output", 30, 0), jOut] }],
      ["w4", { nodes: [jOut, comp("d", "RLOAD", "terminal1", 70, 0)] }],
      ["w5", { nodes: [comp("e", "RLOAD", "terminal2", 70, 40), jGnd] }],

      // Ground rail and battery return.
      ["w6", { nodes: [jGnd, comp("f", "GND", "ground", 0, 50)] }],
      ["w7", { nodes: [comp("g", "BAT", "negative", -60, 40), jGnd] }],
    ]);

    solver.rebuildConnectionsFromInteractiveWires(wires, { gridPitchPx: 10 });
    expect(solver.solveDC()).toBe(true);
    const lowSnap = solver.getSimulationSnapshot();
    const lowI = Math.abs(lowSnap.componentTerminalCurrents.RLOAD?.terminal1 ?? 0);
    expect(lowI).toBeLessThan(5e-4);

    // Flip input LOW by reconnecting INV.input to ground; output should rise and source load current.
    const lowInputWires = new Map([
      ["w3", { nodes: [comp("c", "INV", "output", 30, 0), jOut] }],
      ["w4", { nodes: [jOut, comp("d", "RLOAD", "terminal1", 70, 0)] }],
      ["w5", { nodes: [comp("e", "RLOAD", "terminal2", 70, 40), jGnd] }],
      ["w6", { nodes: [jGnd, comp("f", "GND", "ground", 0, 50)] }],
      ["w7", { nodes: [comp("g", "BAT", "negative", -60, 40), jGnd] }],
      ["w8", { nodes: [comp("h", "INV", "input", -30, 0), jGnd] }],
    ]);
    solver.rebuildConnectionsFromInteractiveWires(lowInputWires, { gridPitchPx: 10 });
    expect(solver.solveDC()).toBe(true);
    const highSnap = solver.getSimulationSnapshot();
    const highI = Math.abs(highSnap.componentTerminalCurrents.RLOAD?.terminal1 ?? 0);
    const outV = highSnap.componentTerminalVoltages.INV?.output ?? 0;

    expect(highI).toBeGreaterThan(0.003);
    expect(highI).toBeGreaterThan(lowI * 20);
    expect(outV).toBeGreaterThan(4.5);
  });
});
