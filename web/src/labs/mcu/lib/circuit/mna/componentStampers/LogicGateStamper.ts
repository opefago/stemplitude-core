import { CircuitComponent } from "../../CircuitComponent";
import { stampLogicGateDigital } from "../domains/digital";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class LogicGateStamper implements ComponentStamper {
  constructor(public readonly type: string) {}

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    const gateType = this.type;
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: gateType,
      apply: (vs) => stampLogicGateDigital(ctx, component, gateType, vs),
    });
  }
}
