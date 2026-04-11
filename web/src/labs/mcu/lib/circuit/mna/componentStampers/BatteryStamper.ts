import { CircuitComponent } from "../../CircuitComponent";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class BatteryStamper implements ComponentStamper {
  public readonly type = "battery";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => {
        const voltage = (component.getCircuitProperties() as any).value;
        const nodes = component.getNodes();
        const n1 = ctx.nodeIndex(`${component.getName()}_${nodes[0]!.id}`);
        const n2 = ctx.nodeIndex(`${component.getName()}_${nodes[1]!.id}`);
        ctx.setVoltageSourceMap(component.getName(), vs);
        ctx.addSeriesVoltageSource(n1, n2, vs, voltage, 0);
        return vs + 1;
      },
    });
  }
}
