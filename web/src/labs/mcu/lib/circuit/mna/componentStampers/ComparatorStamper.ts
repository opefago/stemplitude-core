import { CircuitComponent } from "../../CircuitComponent";
import { stampComparatorSource } from "../domains/linear";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class ComparatorStamper implements ComponentStamper {
  public readonly type = "comparator";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => stampComparatorSource(ctx, component, vs),
    });
  }
}
