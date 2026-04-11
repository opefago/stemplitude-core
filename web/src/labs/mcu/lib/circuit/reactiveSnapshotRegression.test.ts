import { describe, expect, it } from "vitest";
import { EnhancedCircuitSolver } from "./EnhancedCircuitSolver";
import { Battery } from "./components/Battery";
import { Capacitor } from "./components/Capacitor";
import { Ground } from "./components/Ground";
import { Inductor } from "./components/Inductor";
import { Resistor } from "./components/Resistor";
import type { SimulationSnapshot } from "./types/SimulationSnapshot";

const KCL_TOL = 2e-3;
const BRANCH_TOL = 1e-3;

function sumTerminalCurrentsAtNet(
  solver: EnhancedCircuitSolver,
  snap: SimulationSnapshot,
  netIndex: number
): number {
  let sum = 0;
  for (const [cid, comp] of solver.getCircuitComponents()) {
    for (const node of comp.getNodes()) {
      if (solver.getMergedNodeIndex(cid, node.id) !== netIndex) continue;
      sum += snap.componentTerminalCurrents[cid]?.[node.id] ?? 0;
    }
  }
  return sum;
}

function assertPassiveTwoTerminalKcl(
  snap: SimulationSnapshot,
  compId: string,
  n0: string,
  n1: string
): void {
  const tc = snap.componentTerminalCurrents[compId];
  expect(tc).toBeDefined();
  const a = tc![n0] ?? 0;
  const b = tc![n1] ?? 0;
  expect(Math.abs(a + b)).toBeLessThan(KCL_TOL);
}

describe("reactive snapshot regression (C/L transient)", () => {
  it("RC charging: capacitor voltage trends upward; KCL and two-terminal currents stay consistent", () => {
    const solver = new EnhancedCircuitSolver();
    const bat = new Battery("bat", 9, 0.5, 5, 0, 0);
    const gnd = new Ground("gnd");
    const r = new Resistor("r1", 1000, 0.25, 5, 0, 0);
    const c = new Capacitor("c1", 100e-6, 25, 0, 0);
    c.updateCircuitProperties({
      esr: 1e-4,
      leakageResistance: 1e12,
    } as { esr: number; leakageResistance: number });

    solver.addComponent(bat);
    solver.addComponent(gnd);
    solver.addComponent(r);
    solver.addComponent(c);

    solver.connectNodes("bat", "negative", "gnd", "ground");
    solver.connectNodes("bat", "positive", "r1", "terminal1");
    solver.connectNodes("r1", "terminal2", "c1", "positive");
    solver.connectNodes("c1", "negative", "gnd", "ground");

    const junctionNet = solver.getMergedNodeIndex("r1", "terminal2")!;
    expect(junctionNet).toBeGreaterThan(0);

    solver.reset();

    const dt = 2e-4;
    const steps = 4000;
    let prevVc = -Infinity;
    let monotoneBreaks = 0;

    for (let i = 0; i < steps; i++) {
      const ok = solver.simulateTimeStep(dt);
      expect(ok).toBe(true);
      const snap = solver.getSimulationSnapshot();

      assertPassiveTwoTerminalKcl(snap, "r1", "terminal1", "terminal2");
      assertPassiveTwoTerminalKcl(snap, "c1", "positive", "negative");

      expect(Math.abs(sumTerminalCurrentsAtNet(solver, snap, junctionNet))).toBeLessThan(
        KCL_TOL
      );

      const vPos = snap.componentTerminalVoltages?.["c1"]?.["positive"] ?? 0;
      const vNeg = snap.componentTerminalVoltages?.["c1"]?.["negative"] ?? 0;
      const vc = vPos - vNeg;
      if (prevVc !== -Infinity && vc < prevVc - 1e-4) monotoneBreaks++;
      prevVc = vc;
    }

    expect(monotoneBreaks).toBe(0);
    const finalSnap = solver.getSimulationSnapshot();
    const vFinal =
      (finalSnap.componentTerminalVoltages?.["c1"]?.["positive"] ?? 0) -
      (finalSnap.componentTerminalVoltages?.["c1"]?.["negative"] ?? 0);
    expect(vFinal).toBeGreaterThan(6);
    expect(vFinal).toBeLessThanOrEqual(9.2);
  });

  it("RL step: inductor current increases toward steady state; snapshots stay self-consistent", () => {
    const solver = new EnhancedCircuitSolver();
    const bat = new Battery("bat", 9, 0.5, 5, 0, 0);
    const gnd = new Ground("gnd");
    const r = new Resistor("r1", 100, 0.25, 5, 0, 0);
    const l = new Inductor("l1", 50e-3, 5, 0, 0);
    l.updateCircuitProperties({ dcResistance: 0.01 } as { dcResistance: number });

    solver.addComponent(bat);
    solver.addComponent(gnd);
    solver.addComponent(r);
    solver.addComponent(l);

    solver.connectNodes("bat", "negative", "gnd", "ground");
    solver.connectNodes("bat", "positive", "r1", "terminal1");
    solver.connectNodes("r1", "terminal2", "l1", "terminal1");
    solver.connectNodes("l1", "terminal2", "gnd", "ground");

    const midNet = solver.getMergedNodeIndex("r1", "terminal2")!;
    expect(midNet).toBeGreaterThan(0);

    solver.reset();

    const dt = 5e-5;
    const steps = 8000;
    let prevI = -Infinity;
    let monotoneBreaks = 0;

    for (let k = 0; k < steps; k++) {
      expect(solver.simulateTimeStep(dt)).toBe(true);
      const snap = solver.getSimulationSnapshot();

      assertPassiveTwoTerminalKcl(snap, "r1", "terminal1", "terminal2");
      assertPassiveTwoTerminalKcl(snap, "l1", "terminal1", "terminal2");
      expect(Math.abs(sumTerminalCurrentsAtNet(solver, snap, midNet))).toBeLessThan(KCL_TOL);

      const ti = snap.componentTerminalCurrents["l1"]?.["terminal1"] ?? 0;
      if (prevI !== -Infinity && ti < prevI - 5e-4) monotoneBreaks++;
      prevI = ti;
    }

    expect(monotoneBreaks).toBe(0);
    const last = solver.getSimulationSnapshot();
    const iL =
      last.componentTerminalCurrents["l1"]?.["terminal1"] ??
      solver.getCircuitComponents().get("l1")!.getCircuitProperties().current;
    expect(iL).toBeGreaterThan(0.05);
    expect(iL).toBeLessThan(0.2);
  });

  it(
    "overdamped series RLC: branch currents agree across R, L, and C each step",
    () => {
    const solver = new EnhancedCircuitSolver();
    const bat = new Battery("bat", 12, 0.5, 5, 0, 0);
    const gnd = new Ground("gnd");
    const r = new Resistor("r1", 80, 0.25, 5, 0, 0);
    const l = new Inductor("l1", 8e-3, 5, 0, 0);
    const c = new Capacitor("c1", 30e-6, 50, 0, 0);
    l.updateCircuitProperties({ dcResistance: 0.05 } as { dcResistance: number });
    c.updateCircuitProperties({
      esr: 1e-3,
      leakageResistance: 1e12,
    } as { esr: number; leakageResistance: number });

    solver.addComponent(bat);
    solver.addComponent(gnd);
    solver.addComponent(r);
    solver.addComponent(l);
    solver.addComponent(c);

    solver.connectNodes("bat", "negative", "gnd", "ground");
    solver.connectNodes("bat", "positive", "r1", "terminal1");
    solver.connectNodes("r1", "terminal2", "l1", "terminal1");
    solver.connectNodes("l1", "terminal2", "c1", "positive");
    solver.connectNodes("c1", "negative", "gnd", "ground");

    const nRl = solver.getMergedNodeIndex("r1", "terminal2")!;
    const nLc = solver.getMergedNodeIndex("l1", "terminal2")!;
    expect(nRl).toBeGreaterThan(0);
    expect(nLc).toBeGreaterThan(0);

    solver.reset();

    const dt = 1e-4;
    for (let k = 0; k < 2500; k++) {
      expect(solver.simulateTimeStep(dt)).toBe(true);
      const snap = solver.getSimulationSnapshot();

      assertPassiveTwoTerminalKcl(snap, "r1", "terminal1", "terminal2");
      assertPassiveTwoTerminalKcl(snap, "l1", "terminal1", "terminal2");
      assertPassiveTwoTerminalKcl(snap, "c1", "positive", "negative");

      expect(Math.abs(sumTerminalCurrentsAtNet(solver, snap, nRl))).toBeLessThan(KCL_TOL);
      expect(Math.abs(sumTerminalCurrentsAtNet(solver, snap, nLc))).toBeLessThan(KCL_TOL);

      const iR = snap.componentTerminalCurrents["r1"]?.["terminal1"] ?? 0;
      const iL = snap.componentTerminalCurrents["l1"]?.["terminal1"] ?? 0;
      const iC = snap.componentTerminalCurrents["c1"]?.["positive"] ?? 0;
      expect(Math.abs(iR - iL)).toBeLessThan(BRANCH_TOL);
      expect(Math.abs(iL - iC)).toBeLessThan(BRANCH_TOL);
    }
    },
    20_000
  );
});
