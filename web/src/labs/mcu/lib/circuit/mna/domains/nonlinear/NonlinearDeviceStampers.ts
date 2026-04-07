import { LED } from "../../../components/LED";
import { ZenerDiode } from "../../../components/ZenerDiode";
import { NPNTransistor } from "../../../components/NPNTransistor";
import { PNPTransistor } from "../../../components/PNPTransistor";
import { CircuitComponent } from "../../../CircuitComponent";

export interface NonlinearStampContext {
  nodeIndex(globalNodeId: string): number;
  addTwoNodeConductance(n1: number, n2: number, conductance: number): void;
  addTwoNodeCurrentSource(nPlus: number, nMinus: number, current: number): void;
  evaluatePnCompanion(
    vAnodeCathode: number,
    kneeVoltage: number,
    dynamicResistance: number,
  ): { g: number; i: number };
}

export type BjtStampObservation = {
  isCutoff: boolean;
  isActive: boolean;
  isSaturated: boolean;
  baseCurrent: number;
  collectorCurrent: number;
  emitterCurrent: number;
};

export function stampLedCompanion(
  ctx: NonlinearStampContext,
  led: LED,
): void {
  const nodes = led.getNodes();
  const componentId = led.getName();
  const nAnode = ctx.nodeIndex(`${componentId}_${nodes[0]!.id}`);
  const nCathode = ctx.nodeIndex(`${componentId}_${nodes[1]!.id}`);
  const vAnode = nodes[0]!.voltage || 0;
  const vCathode = nodes[1]!.voltage || 0;
  const vak = vAnode - vCathode;
  const forwardVoltage = led.getForwardVoltage();
  const ledProps = led.getCircuitProperties() as any;
  const dynamicResistance = ledProps.dynamicResistance ?? 25;

  const { g, i } = ctx.evaluatePnCompanion(vak, forwardVoltage, dynamicResistance);
  const iEq = i - g * vak;
  ctx.addTwoNodeConductance(nAnode, nCathode, g);
  ctx.addTwoNodeCurrentSource(nAnode, nCathode, iEq);
}

export function stampZenerCompanion(
  ctx: NonlinearStampContext,
  zener: ZenerDiode,
): void {
  const nodes = zener.getNodes();
  const componentId = zener.getName();
  const props = zener.getCircuitProperties() as any;

  const nAnode = ctx.nodeIndex(`${componentId}_${nodes[0]!.id}`);
  const nCathode = ctx.nodeIndex(`${componentId}_${nodes[1]!.id}`);

  const vAnode = nAnode >= 0 ? (nodes[0]!.voltage || 0) : 0;
  const vCathode = nCathode >= 0 ? (nodes[1]!.voltage || 0) : 0;
  const vForward = vAnode - vCathode;
  const vReverse = vCathode - vAnode;

  const forwardVoltage = zener.getForwardVoltage();
  const breakdownVoltage = zener.getBreakdownVoltage();
  const dynamicResistance = props.dynamicResistance || 10;

  const fwd = ctx.evaluatePnCompanion(vForward, forwardVoltage, dynamicResistance);

  let totalG = fwd.g;
  let totalI = fwd.i; // positive is anode -> cathode

  // Reverse breakdown branch: current flows cathode -> anode.
  if (vReverse > breakdownVoltage) {
    const rev = ctx.evaluatePnCompanion(
      vReverse,
      breakdownVoltage,
      dynamicResistance,
    );
    totalG += rev.g;
    totalI -= rev.i;
  }

  const iEq = totalI - totalG * vForward;
  ctx.addTwoNodeConductance(nAnode, nCathode, totalG);
  ctx.addTwoNodeCurrentSource(nAnode, nCathode, iEq);
}

export function stampMosfetSwitch(
  ctx: NonlinearStampContext,
  component: CircuitComponent,
): void {
  const props = component.getCircuitProperties() as any;
  const nodes = component.getNodes();
  const componentId = component.getName();

  const gateNode = nodes.find((n: any) => n.id === "gate");
  const drainNode = nodes.find((n: any) => n.id === "drain");
  const sourceNode = nodes.find((n: any) => n.id === "source");
  if (!drainNode || !sourceNode) return;

  const gateV = gateNode ? gateNode.voltage : 0;
  const sourceV = sourceNode.voltage;
  const rdson = Math.max(props.rdson ?? 0.1, 1e-5);
  const vth = Math.abs(props.vgsThreshold ?? 2);
  const isNmos = component.getComponentType() === "nmos_transistor";
  const overdrive = isNmos ? gateV - sourceV - vth : sourceV - gateV - vth;

  const sharpness = 0.06;
  const sigmoid = 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, overdrive / sharpness))));
  const gOff = 1e-9;
  const gOn = 1 / rdson;
  const conductance = gOff + (gOn - gOff) * sigmoid;

  const n1 = ctx.nodeIndex(`${componentId}_${drainNode.id}`);
  const n2 = ctx.nodeIndex(`${componentId}_${sourceNode.id}`);

  ctx.addTwoNodeConductance(n1, n2, conductance);
}

export function stampBjtSwitchModel(
  ctx: NonlinearStampContext,
  transistor: NPNTransistor | PNPTransistor,
  isPnp: boolean,
): BjtStampObservation {
  const nodes = transistor.getNodes();
  const componentId = transistor.getName();
  const props = transistor.getBJTProperties();

  const nBase = ctx.nodeIndex(`${componentId}_${nodes[0]!.id}`);
  const nCollector = ctx.nodeIndex(`${componentId}_${nodes[1]!.id}`);
  const nEmitter = ctx.nodeIndex(`${componentId}_${nodes[2]!.id}`);

  const vBase = nodes[0]!.voltage;
  const vCollector = nodes[1]!.voltage;
  const vEmitter = nodes[2]!.voltage;

  const vbeEff = isPnp ? vEmitter - vBase : vBase - vEmitter;
  const vceEff = isPnp ? vEmitter - vCollector : vCollector - vEmitter;
  const sharpness = 0.03;
  const drive =
    1 /
    (1 +
      Math.exp(
        -Math.max(-60, Math.min(60, (vbeEff - (props.vbe ?? 0.7)) / sharpness)),
      ));

  const gBeOff = 1e-9;
  const gCeOff = 1e-9;
  const gBeOn = 1 / 1200;
  const gCeOn = 1 / 8;
  const gBe = gBeOff + (gBeOn - gBeOff) * drive;
  const gCe = gCeOff + (gCeOn - gCeOff) * drive;

  ctx.addTwoNodeConductance(nBase, nEmitter, gBe);
  ctx.addTwoNodeConductance(nCollector, nEmitter, gCe);

  const ib = gBe * (vBase - vEmitter);
  const ic = gCe * (vCollector - vEmitter);
  const ie = -(ib + ic);
  const on = drive > 0.5;
  const saturated = vceEff < (props.vcesat ?? 0.2);

  return {
    isCutoff: !on,
    isActive: on && !saturated,
    isSaturated: on && saturated,
    baseCurrent: ib,
    collectorCurrent: ic,
    emitterCurrent: ie,
  };
}
