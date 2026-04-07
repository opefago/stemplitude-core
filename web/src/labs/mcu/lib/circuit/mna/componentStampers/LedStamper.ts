import { CircuitComponent } from "../../CircuitComponent";
import { LED } from "../../components/LED";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class LedStamper implements ComponentStamper {
  public readonly type = "led";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => {
        const led = component as LED;
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
