import { CircuitComponent } from "../../CircuitComponent";
import { stampMosfetSwitch } from "../domains/nonlinear";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class NmosStamper implements ComponentStamper {
  public readonly type = "nmos_transistor";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => {
        stampMosfetSwitch(ctx, component);
        return vs;
      },
    });
  }
}
