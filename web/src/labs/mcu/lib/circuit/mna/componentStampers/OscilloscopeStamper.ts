import { CircuitComponent } from "../../CircuitComponent";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class OscilloscopeStamper implements ComponentStamper {
  public readonly type = "oscilloscope";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => {
        const resistance = (component.getCircuitProperties() as any).resistance || 1e9;
        const nodes = component.getNodes();
        const n1 = ctx.nodeIndex(`${component.getName()}_${nodes[0]!.id}`);
        const n2 = ctx.nodeIndex(`${component.getName()}_${nodes[1]!.id}`);
        ctx.addTwoNodeConductance(n1, n2, 1 / resistance);
        return vs;
      },
    });
  }
}
