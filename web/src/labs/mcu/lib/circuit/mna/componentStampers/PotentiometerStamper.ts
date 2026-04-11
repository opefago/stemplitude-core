import { CircuitComponent } from "../../CircuitComponent";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class PotentiometerStamper implements ComponentStamper {
  public readonly type = "potentiometer";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => {
        const props = component.getCircuitProperties() as {
          totalResistance?: number;
          value?: number;
          wiperPosition?: number;
        };
        const R = props.totalResistance ?? props.value ?? 10000;
        const alpha = props.wiperPosition ?? 0.5;
        const g1 = 1 / Math.max(R * alpha, 1e-9);
        const g2 = 1 / Math.max(R * (1 - alpha), 1e-9);
        const componentId = component.getName();
        const n1 = ctx.nodeIndex(`${componentId}_end1`);
        const nw = ctx.nodeIndex(`${componentId}_wiper`);
        const n2 = ctx.nodeIndex(`${componentId}_end2`);
        ctx.addTwoNodeConductance(n1, nw, g1);
        ctx.addTwoNodeConductance(nw, n2, g2);
        return vs;
      },
    });
  }
}
