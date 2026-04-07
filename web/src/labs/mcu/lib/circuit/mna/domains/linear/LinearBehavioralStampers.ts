import { ACSource } from "../../../components/ACSource";
import { CircuitComponent } from "../../../CircuitComponent";

export interface RelayState {
  drive: number;
  closed: boolean;
}

export interface LinearBehavioralStampContext {
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
  getRelayState(componentId: string): RelayState | undefined;
  setRelayState(componentId: string, state: RelayState): void;
}

export function stampAcSource(
  ctx: LinearBehavioralStampContext,
  source: ACSource,
  vsIndex: number,
): number {
  const voltage = source.getCircuitProperties().voltage;
  const nodes = source.getNodes();
  const componentId = source.getName();
  const n1 = ctx.nodeIndex(`${componentId}_${nodes[0]!.id}`);
  const n2 = ctx.nodeIndex(`${componentId}_${nodes[1]!.id}`);

  ctx.setVoltageSourceMap(componentId, vsIndex);
  ctx.addSeriesVoltageSource(n1, n2, vsIndex, voltage, 0);
  return vsIndex + 1;
}

export function stampRelay(
  ctx: LinearBehavioralStampContext,
  component: CircuitComponent,
): void {
  const props = component.getCircuitProperties() as any;
  const nodes = component.getNodes();
  const componentId = component.getName();

  const coil1 = nodes.find((n: any) => n.id === "coil1");
  const coil2 = nodes.find((n: any) => n.id === "coil2");
  if (!coil1 || !coil2) return;

  const resistance = Math.max(props.coilResistance ?? 100, 1e-3);
  const conductance = 1 / resistance;
  const n1 = ctx.nodeIndex(`${componentId}_${coil1.id}`);
  const n2 = ctx.nodeIndex(`${componentId}_${coil2.id}`);
  ctx.addTwoNodeConductance(n1, n2, conductance);

  const vCoil = Math.abs((coil1.voltage ?? 0) - (coil2.voltage ?? 0));
  const vAct = Math.max(0.1, props.activationVoltage ?? 5);
  const pickup = vAct;
  const dropout = 0.7 * vAct;
  const prev = ctx.getRelayState(componentId) ?? { drive: 0, closed: false };
  let closed = prev.closed;
  if (!closed && vCoil >= pickup) closed = true;
  if (closed && vCoil <= dropout) closed = false;
  closed = ctx.limitStateFlip(`relay:${componentId}`, prev.closed, closed);
  const targetDrive = closed ? 1 : 0;
  const tauPull = 1.2e-3;
  const tauRelease = 2.5e-3;
  const tau = targetDrive > prev.drive ? tauPull : tauRelease;
  const alpha = Math.min(1, ctx.timeStep / (ctx.timeStep + tau));
  const drive = prev.drive + alpha * (targetDrive - prev.drive);
  ctx.setRelayState(componentId, { drive, closed });
  component.updateCircuitProperties({ isActivated: drive > 0.5 } as any);

  const contactCommon = nodes.find((n: any) => n.id === "contact_common");
  const contactNo = nodes.find((n: any) => n.id === "contact_no");
  if (!contactCommon || !contactNo) return;
  const ron = 0.03;
  const roff = 1e9;
  const gOn = 1 / ron;
  const gOff = 1 / roff;
  const contactG = gOff + (gOn - gOff) * drive;
  const nc = ctx.nodeIndex(`${componentId}_${contactCommon.id}`);
  const nn = ctx.nodeIndex(`${componentId}_${contactNo.id}`);
  ctx.addTwoNodeConductance(nc, nn, contactG);
}
