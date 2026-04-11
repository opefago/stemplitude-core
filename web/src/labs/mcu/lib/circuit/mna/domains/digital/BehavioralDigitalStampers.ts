import { CircuitComponent } from "../../../CircuitComponent";

export interface Timer555State {
  latchSet: boolean;
  outputHigh: boolean;
  ctrlFiltered: number;
}

export interface BehavioralDigitalStampContext {
  nodeIndex(globalNodeId: string): number;
  timeStep: number;
  addTwoNodeConductance(n1: number, n2: number, conductance: number): void;
  addSeriesVoltageSource(
    nPlus: number,
    nMinus: number,
    vsIndex: number,
    voltage: number,
    seriesResistance: number,
  ): void;
  setVoltageSourceMap(componentId: string, vsIndex: number): void;
  limitStateFlip(key: string, prev: boolean, next: boolean): boolean;
  getTimer555State(componentId: string): Timer555State | undefined;
  setTimer555State(componentId: string, state: Timer555State): void;
}

export function stampTimer555Digital(
  ctx: BehavioralDigitalStampContext,
  component: CircuitComponent,
  vsIndex: number,
): number {
  const componentId = component.getName();
  const nodes = component.getNodes();
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const nOut = ctx.nodeIndex(`${componentId}_out`);
  const nGnd = ctx.nodeIndex(`${componentId}_gnd`);
  const nDis = ctx.nodeIndex(`${componentId}_disch`);

  const vGnd = byId.get("gnd")?.voltage ?? 0;
  const vVcc = byId.get("vcc")?.voltage ?? vGnd;
  const vTrig = byId.get("trig")?.voltage ?? vGnd;
  const vThresh = byId.get("thresh")?.voltage ?? vGnd;
  const vCtrlRaw = byId.get("ctrl")?.voltage ?? vGnd;
  const vRst = byId.get("rst")?.voltage ?? vVcc;

  const vSupply = Math.max(0, vVcc - vGnd);
  const resetLow = vRst - vGnd < 0.8;
  const enabled = !resetLow && vSupply >= 4.0;
  const ctrlValid = Number.isFinite(vCtrlRaw) && Math.abs(vCtrlRaw - vGnd) > 0.05;
  const trigRel = vTrig - vGnd;
  const threshRel = vThresh - vGnd;

  const prev = ctx.getTimer555State(componentId) ?? {
    latchSet: false,
    outputHigh: false,
    ctrlFiltered: (2 / 3) * vSupply,
  };
  const ctrlAlpha = Math.min(1, ctx.timeStep / (ctx.timeStep + 2e-6));
  const ctrlInstant = ctrlValid ? vCtrlRaw - vGnd : (2 / 3) * vSupply;
  const ctrlFiltered = prev.ctrlFiltered + ctrlAlpha * (ctrlInstant - prev.ctrlFiltered);
  const vUpperRaw = ctrlValid ? ctrlFiltered : (2 / 3) * vSupply;
  const vUpper = Math.min(Math.max(vUpperRaw, 0.2 * vSupply), 0.95 * vSupply);
  const vLower = 0.5 * vUpper;
  const hyst = Math.max(0.003, 0.002 * vSupply);
  let latchSet = prev.latchSet;
  if (!enabled) {
    latchSet = false;
  } else {
    if (trigRel < vLower - hyst) latchSet = true;
    if (threshRel > vUpper + hyst) latchSet = false;
  }
  latchSet = ctx.limitStateFlip(`timer555:${componentId}`, prev.latchSet, latchSet);
  const outputHigh = enabled && latchSet;
  ctx.setTimer555State(componentId, { latchSet, outputHigh, ctrlFiltered });

  const dischR = outputHigh ? 1e9 : 12;
  ctx.addTwoNodeConductance(nDis, nGnd, 1 / dischR);

  const outTarget = outputHigh ? Math.max(0, vSupply - 1.2) : 0.15;
  const outR = outputHigh ? 25 : 18;
  ctx.setVoltageSourceMap(componentId, vsIndex);
  ctx.addSeriesVoltageSource(nOut, nGnd, vsIndex, outTarget, outR);
  component.updateCircuitProperties({ outputHigh } as any);
  return vsIndex + 1;
}

export function stampLogicGateDigital(
  ctx: BehavioralDigitalStampContext,
  component: CircuitComponent,
  gateType: string,
  vsIndex: number,
): number {
  const componentId = component.getName();
  const nodes = component.getNodes();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const nGnd = -1;
  const logicThreshold = 2.5;
  const vHigh = 5;
  const vLow = 0;
  const rout = 35;
  const zin = 1e7;

  const boolFromNode = (nodeId: string): boolean =>
    (byId.get(nodeId)?.voltage ?? 0) >= logicThreshold;

  ["inputA", "inputB", "input1", "input2", "input"].forEach((id) => {
    const idx = ctx.nodeIndex(`${componentId}_${id}`);
    if (idx >= 0) ctx.addTwoNodeConductance(idx, nGnd, 1 / zin);
  });

  let outHigh = false;
  if (gateType === "not_gate") {
    const a = boolFromNode("input");
    outHigh = !a;
    component.updateCircuitProperties({ input: a, output: outHigh } as any);
  } else if (gateType === "and_gate") {
    const a = boolFromNode("inputA");
    const b = boolFromNode("inputB");
    outHigh = a && b;
    component.updateCircuitProperties({ inputA: a, inputB: b, output: outHigh } as any);
  } else if (gateType === "or_gate") {
    const a = boolFromNode("inputA");
    const b = boolFromNode("inputB");
    outHigh = a || b;
    component.updateCircuitProperties({ inputA: a, inputB: b, output: outHigh } as any);
  } else if (gateType === "xor_gate") {
    const a = boolFromNode("inputA");
    const b = boolFromNode("inputB");
    outHigh = a !== b;
    component.updateCircuitProperties({ inputA: a, inputB: b, output: outHigh } as any);
  } else if (gateType === "nand_gate") {
    const a = boolFromNode("input1");
    const b = boolFromNode("input2");
    outHigh = !(a && b);
    component.updateCircuitProperties({ inputStates: [a, b], outputState: outHigh } as any);
  } else if (gateType === "nor_gate") {
    const a = boolFromNode("input1");
    const b = boolFromNode("input2");
    outHigh = !(a || b);
    component.updateCircuitProperties({ inputStates: [a, b], outputState: outHigh } as any);
  }

  const nOut = ctx.nodeIndex(`${componentId}_output`);
  if (nOut < 0) return vsIndex;

  ctx.setVoltageSourceMap(componentId, vsIndex);
  ctx.addSeriesVoltageSource(nOut, nGnd, vsIndex, outHigh ? vHigh : vLow, rout);
  return vsIndex + 1;
}
