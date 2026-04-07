import { CircuitComponent } from "../../CircuitComponent";
import { stampTimer555Digital } from "../domains/digital";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class Timer555Stamper implements ComponentStamper {
  public readonly type = "timer555";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => stampTimer555Digital(ctx, component, vs),
    });
  }
}
