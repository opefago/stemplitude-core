import { CircuitComponent } from "../../CircuitComponent";
import { stampRelay } from "../domains/linear";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class RelayStamper implements ComponentStamper {
  public readonly type = "relay";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => {
        stampRelay(ctx, component);
        return vs;
      },
    });
  }
}
