import { CircuitComponent } from "../../CircuitComponent";
import { NPNTransistor } from "../../components/NPNTransistor";
import { stampBjtSwitchModel } from "../domains/nonlinear";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class NpnTransistorStamper implements ComponentStamper {
  public readonly type = "npn_transistor";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => {
        const obs = stampBjtSwitchModel(ctx, component as NPNTransistor, false);
        component.updateCircuitProperties({
          isCutoff: obs.isCutoff,
          isActive: obs.isActive,
          isSaturated: obs.isSaturated,
          baseCurrent: obs.baseCurrent,
          collectorCurrent: obs.collectorCurrent,
          emitterCurrent: obs.emitterCurrent,
        } as any);
        return vs;
      },
    });
  }
}
