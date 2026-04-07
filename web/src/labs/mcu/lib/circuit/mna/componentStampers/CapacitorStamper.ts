import { CircuitComponent } from "../../CircuitComponent";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class CapacitorStamper implements ComponentStamper {
  public readonly type = "capacitor";

  public stamp(_component: CircuitComponent, _ctx: ComponentStamperContext): void {
    // Open circuit for DC operating point; transient contribution is stamped later.
  }
}
