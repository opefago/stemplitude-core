import { CircuitComponent } from "../../CircuitComponent";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class ResistorStamper implements ComponentStamper {
  public readonly type = "resistor";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => {
        const props = component.getCircuitProperties() as any;
        const isBurnt = Boolean(props?.burnt);
        const resistance = isBurnt
          ? 1e12
          : typeof (component as any).getImpedance === "function"
            ? (component as any).getImpedance(0)
            : props?.value;
        if (!(resistance > 0)) return vs;
        const nodes = component.getNodes();
        const n1 = ctx.nodeIndex(`${component.getName()}_${nodes[0]!.id}`);
        const n2 = ctx.nodeIndex(`${component.getName()}_${nodes[1]!.id}`);
        ctx.addTwoNodeConductance(n1, n2, 1 / resistance);
        return vs;
      },
    });
  }
}
