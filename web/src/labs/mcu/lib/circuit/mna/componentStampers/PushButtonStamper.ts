import { CircuitComponent } from "../../CircuitComponent";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class PushButtonStamper implements ComponentStamper {
  public readonly type = "push_button";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => {
        const p = component.getCircuitProperties() as {
          isClosed?: boolean;
          resistance?: number;
        };
        const resistance =
          typeof p.isClosed === "boolean"
            ? p.isClosed
              ? 1e-3
              : 1e15
            : p.resistance && p.resistance > 0
              ? p.resistance
              : 1e15;
        const nodes = component.getNodes();
        const n1 = ctx.nodeIndex(`${component.getName()}_${nodes[0]!.id}`);
        const n2 = ctx.nodeIndex(`${component.getName()}_${nodes[1]!.id}`);
        ctx.addTwoNodeConductance(n1, n2, 1 / resistance);
        return vs;
      },
    });
  }
}
