import { ACSource } from "../../components/ACSource";
import { CircuitComponent } from "../../CircuitComponent";
import { stampAcSource } from "../domains/linear";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class AcSourceStamper implements ComponentStamper {
  public readonly type = "acsource";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => stampAcSource(ctx, component as ACSource, vs),
    });
  }
}
