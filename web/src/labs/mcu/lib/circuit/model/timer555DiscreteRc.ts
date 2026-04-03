/**
 * Falstad-style discrete passives for NE555 astable: find R1 (Vcc–DIS), R2 (DIS–TRIG),
 * and C (TRIG–GND) from placed resistors/capacitors using merged solver nets.
 *
 * Supports only direct branches: one or more passives in parallel between each pair of nets
 * (equivalent series chains like Vcc–R–R–DIS are not merged into one R).
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

function parallelResistance(ohms: number[]): number {
  const ok = ohms.filter((r) => r > 0 && Number.isFinite(r));
  if (ok.length === 0) return 0;
  let inv = 0;
  for (const r of ok) inv += 1 / r;
  return 1 / inv;
}

function parallelCapacitance(farads: number[]): number {
  const ok = farads.filter((c) => c > 0 && Number.isFinite(c));
  if (ok.length === 0) return 0;
  return ok.reduce((a, b) => a + b, 0);
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

/**
 * @param getMergedIndex - post-union solver index for `componentId_nodeId` (ground group → 0)
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

  const r1List: number[] = [];
  const r2List: number[] = [];
  const cList: number[] = [];

  components.forEach((comp, compId) => {
    if (compId === timerId) return;
    const t = comp.getComponentType();

    if (t === "resistor") {
      const ia = getMergedIndex(compId, "terminal1");
      const ib = getMergedIndex(compId, "terminal2");
      if (ia === undefined || ib === undefined) return;
      const ro = resistorOhms(comp);
      if (ro <= 0) return;

      if (
        (ia === idxVcc && ib === idxDis) ||
        (ia === idxDis && ib === idxVcc)
      ) {
        r1List.push(ro);
      }
      if (
        (ia === idxDis && ib === idxTrig) ||
        (ia === idxTrig && ib === idxDis)
      ) {
        r2List.push(ro);
      }
      return;
    }

    if (t === "capacitor") {
      const ia = getMergedIndex(compId, "positive");
      const ib = getMergedIndex(compId, "negative");
      if (ia === undefined || ib === undefined) return;
      const cf = capacitorFarads(comp);
      if (cf <= 0) return;

      if (
        (ia === idxTrig && ib === idxGnd) ||
        (ia === idxGnd && ib === idxTrig)
      ) {
        cList.push(cf);
      }
    }
  });

  const r1Ohms = parallelResistance(r1List);
  const r2Ohms = parallelResistance(r2List);
  const cFarads = parallelCapacitance(cList);

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
