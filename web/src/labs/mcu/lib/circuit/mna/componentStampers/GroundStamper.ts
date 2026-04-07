import { CircuitComponent } from "../../CircuitComponent";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class GroundStamper implements ComponentStamper {
  public readonly type = "ground";

  public stamp(_component: CircuitComponent, _ctx: ComponentStamperContext): void {
    // Ground participates through node-map collapsing, no direct stamp.
  }
}
