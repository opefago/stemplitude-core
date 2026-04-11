import { CircuitComponent } from "../../CircuitComponent";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class SpdtSwitchStamper implements ComponentStamper {
  public readonly type = "spdt_switch";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => {
        const props = component.getCircuitProperties() as { connectUpper?: boolean };
        const connectUpper = props.connectUpper ?? true;
        const nodes = component.getNodes();
        const componentId = component.getName();
        const rOn = 0.02;
        const rOff = 1e9;
        const nc = ctx.nodeIndex(`${componentId}_${nodes[0]!.id}`);
        const na = ctx.nodeIndex(`${componentId}_${nodes[1]!.id}`);
        const nb = ctx.nodeIndex(`${componentId}_${nodes[2]!.id}`);
        const prev = ctx.getSpdtState(componentId) ?? (connectUpper ? 1 : 0);
        const prevMode = prev >= 0.5;
        const limitedMode = ctx.limitStateFlip(
          `spdt:${componentId}`,
          prevMode,
          connectUpper,
        );
        const target = limitedMode ? 1 : 0;
        const tau = 2e-4;
        const alpha = Math.min(1, ctx.timeStep / (ctx.timeStep + tau));
        const wiper = prev + alpha * (target - prev);
        ctx.setSpdtState(componentId, wiper);
        const upperClosure = wiper > 0.55 ? 1 : wiper < 0.45 ? 0 : (wiper - 0.45) / 0.1;
        const lowerClosure = wiper < 0.45 ? 1 : wiper > 0.55 ? 0 : (0.55 - wiper) / 0.1;
        const gOn = 1 / rOn;
        const gOff = 1 / rOff;
        const gA = gOff + (gOn - gOff) * upperClosure;
        const gB = gOff + (gOn - gOff) * lowerClosure;
        ctx.addTwoNodeConductance(nc, na, gA);
        ctx.addTwoNodeConductance(nc, nb, gB);
        return vs;
      },
    });
  }
}
