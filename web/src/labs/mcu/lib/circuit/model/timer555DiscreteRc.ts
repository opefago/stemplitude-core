/**
 * Falstad-style discrete passives for NE555 astable:
 * - R1 equivalent between Vcc and DIS
 * - R2 equivalent between DIS and the tied TRIG/THRESH node
 * - C equivalent between TRIG/THRESH node and GND
 *
 * For resistors/capacitors, we compute equivalent values across full passive
 * networks spanning the endpoint nets (series/parallel/mixed), not just direct branches.
 */

import type { CircuitComponent } from "../CircuitComponent";

export type DiscreteRcReason =
  | "ok"
  | "no_solver"
  | "no_resolver"
  | "tie_2_6"
  | "short_7_2"
  | "need_r1"
  | "need_r2"
  | "need_c";

export interface AstableDiscreteRcResult {
  r1Ohms: number;
  r2Ohms: number;
  cFarads: number;
  valid: boolean;
  reason: DiscreteRcReason;
}

interface ResBranch {
  a: number;
  b: number;
  r: number;
}
interface CapBranch {
  a: number;
  b: number;
  c: number;
}

function resistorOhms(c: CircuitComponent): number {
  const p = c.getCircuitProperties() as { value?: number; resistance?: number };
  const v = p.value ?? p.resistance ?? 0;
  return typeof v === "number" && v > 0 ? v : 0;
}

function capacitorFarads(c: CircuitComponent): number {
  const p = c.getCircuitProperties() as { value?: number; capacitance?: number };
  const v = p.value ?? p.capacitance ?? 0;
  return typeof v === "number" && v > 0 ? v : 0;
}

function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = a.length;
  if (n === 0) return [];
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-15) return null;
    if (pivot !== col) {
      const tmp = m[col];
      m[col] = m[pivot];
      m[pivot] = tmp;
    }

    const div = m[col][col];
    for (let k = col; k <= n; k++) m[col][k] /= div;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = m[row][col];
      if (Math.abs(factor) < 1e-20) continue;
      for (let k = col; k <= n; k++) m[row][k] -= factor * m[col][k];
    }
  }

  const x = Array(n).fill(0);
  for (let i = 0; i < n; i++) x[i] = m[i][n];
  return x;
}

function equivalentResistanceBetweenNets(
  branches: ResBranch[],
  netA: number,
  netB: number
): number {
  if (netA === netB) return 0;
  const relevant = branches.filter(
    (e) => Number.isFinite(e.r) && e.r > 0 && (e.a !== e.b)
  );
  if (relevant.length === 0) return 0;

  // Build connected component from netA and ensure netB is reachable.
  const adj = new Map<number, Set<number>>();
  const add = (u: number, v: number) => {
    if (!adj.has(u)) adj.set(u, new Set());
    adj.get(u)!.add(v);
  };
  for (const e of relevant) {
    add(e.a, e.b);
    add(e.b, e.a);
  }

  const seen = new Set<number>();
  const stack: number[] = [netA];
  while (stack.length > 0) {
    const u = stack.pop()!;
    if (seen.has(u)) continue;
    seen.add(u);
    const nbrs = adj.get(u);
    if (!nbrs) continue;
    nbrs.forEach((v) => {
      if (!seen.has(v)) stack.push(v);
    });
  }
  if (!seen.has(netB)) return 0;

  const edges = relevant.filter((e) => seen.has(e.a) && seen.has(e.b));
  const internalNodes = Array.from(seen).filter((n) => n !== netA && n !== netB);
  const nodeToIdx = new Map<number, number>();
  internalNodes.forEach((n, i) => nodeToIdx.set(n, i));

  const n = internalNodes.length;
  const g = Array(n)
    .fill(0)
    .map(() => Array(n).fill(0));
  const rhs = Array(n).fill(0);

  const vKnown = (node: number): number | null => {
    if (node === netA) return 1;
    if (node === netB) return 0;
    return null;
  };

  for (const e of edges) {
    const cond = 1 / e.r;
    const ia = nodeToIdx.get(e.a);
    const ib = nodeToIdx.get(e.b);
    const va = vKnown(e.a);
    const vb = vKnown(e.b);

    if (ia !== undefined) {
      g[ia][ia] += cond;
      if (ib !== undefined) g[ia][ib] -= cond;
      else if (vb !== null) rhs[ia] += cond * vb;
    }
    if (ib !== undefined) {
      g[ib][ib] += cond;
      if (ia !== undefined) g[ib][ia] -= cond;
      else if (va !== null) rhs[ib] += cond * va;
    }
  }

  const vinternal = solveLinearSystem(g, rhs);
  if (vinternal === null) return 0;

  const vNode = (node: number): number => {
    const known = vKnown(node);
    if (known !== null) return known;
    const idx = nodeToIdx.get(node);
    return idx !== undefined ? vinternal[idx] : 0;
  };

  // 1V between A and B => Req = 1 / I_from_A
  let iFromA = 0;
  for (const e of edges) {
    if (e.a === netA) iFromA += (1 / e.r) * (1 - vNode(e.b));
    else if (e.b === netA) iFromA += (1 / e.r) * (1 - vNode(e.a));
  }

  if (!Number.isFinite(iFromA) || iFromA <= 1e-15) return 0;
  return 1 / iFromA;
}

function equivalentCapacitanceBetweenNets(
  branches: CapBranch[],
  netA: number,
  netB: number
): number {
  if (netA === netB) return 0;
  const relevant = branches.filter(
    (e) => Number.isFinite(e.c) && e.c > 0 && e.a !== e.b
  );
  if (relevant.length === 0) return 0;

  const adj = new Map<number, Set<number>>();
  const add = (u: number, v: number) => {
    if (!adj.has(u)) adj.set(u, new Set());
    adj.get(u)!.add(v);
  };
  for (const e of relevant) {
    add(e.a, e.b);
    add(e.b, e.a);
  }

  const seen = new Set<number>();
  const stack: number[] = [netA];
  while (stack.length > 0) {
    const u = stack.pop()!;
    if (seen.has(u)) continue;
    seen.add(u);
    const nbrs = adj.get(u);
    if (!nbrs) continue;
    nbrs.forEach((v) => {
      if (!seen.has(v)) stack.push(v);
    });
  }
  if (!seen.has(netB)) return 0;

  const edges = relevant.filter((e) => seen.has(e.a) && seen.has(e.b));
  const internalNodes = Array.from(seen).filter((n) => n !== netA && n !== netB);
  const nodeToIdx = new Map<number, number>();
  internalNodes.forEach((n, i) => nodeToIdx.set(n, i));

  const n = internalNodes.length;
  const g = Array(n)
    .fill(0)
    .map(() => Array(n).fill(0));
  const rhs = Array(n).fill(0);

  const vKnown = (node: number): number | null => {
    if (node === netA) return 1;
    if (node === netB) return 0;
    return null;
  };

  for (const e of edges) {
    // Use C as "conductance-like" weight; equivalent C extraction matches nodal solve.
    const cond = e.c;
    const ia = nodeToIdx.get(e.a);
    const ib = nodeToIdx.get(e.b);
    const va = vKnown(e.a);
    const vb = vKnown(e.b);

    if (ia !== undefined) {
      g[ia][ia] += cond;
      if (ib !== undefined) g[ia][ib] -= cond;
      else if (vb !== null) rhs[ia] += cond * vb;
    }
    if (ib !== undefined) {
      g[ib][ib] += cond;
      if (ia !== undefined) g[ib][ia] -= cond;
      else if (va !== null) rhs[ib] += cond * va;
    }
  }

  const vinternal = solveLinearSystem(g, rhs);
  if (vinternal === null) return 0;

  const vNode = (node: number): number => {
    const known = vKnown(node);
    if (known !== null) return known;
    const idx = nodeToIdx.get(node);
    return idx !== undefined ? vinternal[idx] : 0;
  };

  // 1V between A and B => Ceq = I_from_A
  let iFromA = 0;
  for (const e of edges) {
    if (e.a === netA) iFromA += e.c * (1 - vNode(e.b));
    else if (e.b === netA) iFromA += e.c * (1 - vNode(e.a));
  }
  return Number.isFinite(iFromA) && iFromA > 1e-18 ? iFromA : 0;
}

/**
 * @param getMergedIndex - post-union solver index for `componentId_nodeId` (ground group -> 0)
 */
export function resolveAstableDiscreteRcFromNetlist(
  timerId: string,
  components: ReadonlyMap<string, CircuitComponent>,
  getMergedIndex: (componentId: string, nodeId: string) => number | undefined
): AstableDiscreteRcResult {
  const fail = (reason: DiscreteRcReason): AstableDiscreteRcResult => ({
    r1Ohms: 0,
    r2Ohms: 0,
    cFarads: 0,
    valid: false,
    reason,
  });

  const idxVcc = getMergedIndex(timerId, "vcc");
  const idxGnd = getMergedIndex(timerId, "gnd");
  const idxDis = getMergedIndex(timerId, "disch");
  const idxTrig = getMergedIndex(timerId, "trig");
  const idxThresh = getMergedIndex(timerId, "thresh");

  if (
    idxVcc === undefined ||
    idxGnd === undefined ||
    idxDis === undefined ||
    idxTrig === undefined ||
    idxThresh === undefined
  ) {
    return fail("no_solver");
  }

  if (idxTrig !== idxThresh) {
    return fail("tie_2_6");
  }

  if (idxDis === idxTrig) {
    return fail("short_7_2");
  }

  const resistorBranches: ResBranch[] = [];
  const capacitorBranches: CapBranch[] = [];

  components.forEach((comp, compId) => {
    if (compId === timerId) return;
    const t = comp.getComponentType();

    if (t === "resistor") {
      const ia = getMergedIndex(compId, "terminal1");
      const ib = getMergedIndex(compId, "terminal2");
      if (ia === undefined || ib === undefined) return;
      const ro = resistorOhms(comp);
      if (ro <= 0) return;
      resistorBranches.push({ a: ia, b: ib, r: ro });
      return;
    }

    if (t === "capacitor") {
      const ia = getMergedIndex(compId, "positive");
      const ib = getMergedIndex(compId, "negative");
      if (ia === undefined || ib === undefined) return;
      const cf = capacitorFarads(comp);
      if (cf <= 0) return;
      capacitorBranches.push({ a: ia, b: ib, c: cf });
    }
  });

  const r1Ohms = equivalentResistanceBetweenNets(resistorBranches, idxVcc, idxDis);
  const r2Ohms = equivalentResistanceBetweenNets(resistorBranches, idxDis, idxTrig);
  const cFarads = equivalentCapacitanceBetweenNets(
    capacitorBranches,
    idxTrig,
    idxGnd
  );

  if (r1Ohms <= 0) return fail("need_r1");
  if (r2Ohms <= 0) return fail("need_r2");
  if (cFarads <= 0) return fail("need_c");

  return {
    r1Ohms,
    r2Ohms,
    cFarads,
    valid: true,
    reason: "ok",
  };
}
