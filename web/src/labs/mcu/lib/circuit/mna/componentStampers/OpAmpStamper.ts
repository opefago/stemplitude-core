import { CircuitComponent } from "../../CircuitComponent";
import { stampOpAmpSource } from "../domains/linear";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class OpAmpStamper implements ComponentStamper {
  public readonly type = "opamp";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => stampOpAmpSource(ctx, component, vs),
    });
  }
}
