import { CircuitComponent } from "../../CircuitComponent";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class DiodeStamper implements ComponentStamper {
  public readonly type = "diode";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => {
        const nodes = component.getNodes();
        const componentId = component.getName();
        const nAnode = ctx.nodeIndex(`${componentId}_${nodes[0]!.id}`);
        const nCathode = ctx.nodeIndex(`${componentId}_${nodes[1]!.id}`);
        const vAnode = nodes[0]!.voltage || 0;
        const vCathode = nodes[1]!.voltage || 0;
        const vak = vAnode - vCathode;
        const props = component.getCircuitProperties() as any;
        const forwardVoltage = props.forwardVoltage ?? 0.7;
        const dynamicResistance = props.dynamicResistance ?? 25;
        const { g, i } = ctx.evaluatePnCompanion(
          vak,
          forwardVoltage,
          dynamicResistance,
        );
        const iEq = i - g * vak;
        ctx.addTwoNodeConductance(nAnode, nCathode, g);
        ctx.addTwoNodeCurrentSource(nAnode, nCathode, iEq);
        return vs;
      },
    });
  }
}
