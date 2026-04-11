import { CircuitComponent } from "../../../CircuitComponent";

export interface BehavioralSourceStampContext {
  nodeIndex(globalNodeId: string): number;
  addTwoNodeConductance(n1: number, n2: number, conductance: number): void;
  addSeriesVoltageSource(
    nPlus: number,
    nMinus: number,
    vsIndex: number,
    voltage: number,
    seriesResistance: number,
  ): void;
  setVoltageSourceMap(componentId: string, vsIndex: number): void;
  getComparatorState(componentId: string): boolean | undefined;
  setComparatorState(componentId: string, isHigh: boolean): void;
  limitStateFlip(key: string, prev: boolean, next: boolean): boolean;
}

export function stampOpAmpSource(
  ctx: BehavioralSourceStampContext,
  component: CircuitComponent,
  vsIndex: number,
): number {
  const componentId = component.getName();
  const props = component.getCircuitProperties() as any;
  const nodes = component.getNodes();
  const inv = nodes.find((n) => n.id === "inverting");
  const nonInv = nodes.find((n) => n.id === "nonInverting");
  const out = nodes.find((n) => n.id === "output");
  if (!inv || !nonInv || !out) return vsIndex;

  const nInv = ctx.nodeIndex(`${componentId}_${inv.id}`);
  const nNonInv = ctx.nodeIndex(`${componentId}_${nonInv.id}`);
  const nOut = ctx.nodeIndex(`${componentId}_${out.id}`);
  const nGnd = -1;

  const zin = Math.max(props.inputImpedance ?? 1e6, 1e3);
  ctx.addTwoNodeConductance(nInv, nGnd, 1 / zin);
  ctx.addTwoNodeConductance(nNonInv, nGnd, 1 / zin);

  const vDiff = (nonInv.voltage ?? 0) - (inv.voltage ?? 0);
  const av = Math.max(props.openLoopGain ?? 100000, 1);
  const vSatP = props.vSatPositive ?? 12;
  const vSatN = props.vSatNegative ?? -12;
  const vTargetRaw = av * vDiff;
  const vTarget = Math.max(vSatN, Math.min(vSatP, vTargetRaw));
  const rout = Math.max(props.outputImpedance ?? 75, 1e-3);

  ctx.setVoltageSourceMap(componentId, vsIndex);
  ctx.addSeriesVoltageSource(nOut, nGnd, vsIndex, vTarget, rout);
  return vsIndex + 1;
}

export function stampComparatorSource(
  ctx: BehavioralSourceStampContext,
  component: CircuitComponent,
  vsIndex: number,
): number {
  const componentId = component.getName();
  const props = component.getCircuitProperties() as any;
  const nodes = component.getNodes();
  const inv = nodes.find((n) => n.id === "inverting");
  const nonInv = nodes.find((n) => n.id === "nonInverting");
  const out = nodes.find((n) => n.id === "output");
  if (!inv || !nonInv || !out) return vsIndex;

  const nInv = ctx.nodeIndex(`${componentId}_${inv.id}`);
  const nNonInv = ctx.nodeIndex(`${componentId}_${nonInv.id}`);
  const nOut = ctx.nodeIndex(`${componentId}_${out.id}`);
  const nGnd = -1;

  const zin = 1e6;
  ctx.addTwoNodeConductance(nInv, nGnd, 1 / zin);
  ctx.addTwoNodeConductance(nNonInv, nGnd, 1 / zin);

  const threshold = props.threshold ?? 0;
  const hysteresis = Math.max(props.hysteresis ?? 0.1, 0);
  const vDiff = (nonInv.voltage ?? 0) - (inv.voltage ?? 0);
  const prevHigh = ctx.getComparatorState(componentId) ?? !!props.isOutputHigh;
  let isHigh = prevHigh;
  if (prevHigh) {
    if (vDiff < threshold - hysteresis) isHigh = false;
  } else if (vDiff > threshold + hysteresis) {
    isHigh = true;
  }
  isHigh = ctx.limitStateFlip(`comparator:${componentId}`, prevHigh, isHigh);
  ctx.setComparatorState(componentId, isHigh);
  component.updateCircuitProperties({ isOutputHigh: isHigh } as any);

  const vHigh = props.outputHigh ?? 5;
  const vLow = props.outputLow ?? 0;
  const vTarget = isHigh ? vHigh : vLow;
  const rout = 40;

  ctx.setVoltageSourceMap(componentId, vsIndex);
  ctx.addSeriesVoltageSource(nOut, nGnd, vsIndex, vTarget, rout);
  return vsIndex + 1;
}
