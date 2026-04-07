import { CircuitComponent } from "../../CircuitComponent";
import { PNPTransistor } from "../../components/PNPTransistor";
import { stampBjtSwitchModel } from "../domains/nonlinear";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class PnpTransistorStamper implements ComponentStamper {
  public readonly type = "pnp_transistor";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => {
        const obs = stampBjtSwitchModel(ctx, component as PNPTransistor, true);
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
