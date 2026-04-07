import { CircuitComponent } from "../../CircuitComponent";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class InductorStamper implements ComponentStamper {
  public readonly type = "inductor";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    if (ctx.inTransientStamping) return;
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => {
        const nodes = component.getNodes();
        const props = component.getCircuitProperties() as any;
        const dcr = Math.max(props.dcResistance ?? 0.1, 1e-5);
        const n1 = ctx.nodeIndex(`${component.getName()}_${nodes[0]!.id}`);
        const n2 = ctx.nodeIndex(`${component.getName()}_${nodes[1]!.id}`);
        ctx.addTwoNodeConductance(n1, n2, 1 / dcr);
        return vs;
      },
    });
  }
}
