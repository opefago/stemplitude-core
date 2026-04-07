import { CircuitComponent } from "../../CircuitComponent";
import { ZenerDiode } from "../../components/ZenerDiode";
import { ComponentStamper, ComponentStamperContext } from "./ComponentStamper";

export class ZenerStamper implements ComponentStamper {
  public readonly type = "zener_diode";

  public stamp(component: CircuitComponent, ctx: ComponentStamperContext): void {
    ctx.netlist.add({
      componentId: component.getName(),
      componentType: this.type,
      apply: (vs) => {
        const zener = component as ZenerDiode;
        const nodes = zener.getNodes();
        const componentId = zener.getName();
        const props = zener.getCircuitProperties() as any;
        const nAnode = ctx.nodeIndex(`${componentId}_${nodes[0]!.id}`);
        const nCathode = ctx.nodeIndex(`${componentId}_${nodes[1]!.id}`);
        const vAnode = nAnode >= 0 ? (nodes[0]!.voltage || 0) : 0;
        const vCathode = nCathode >= 0 ? (nodes[1]!.voltage || 0) : 0;
        const vForward = vAnode - vCathode;
        const vReverse = vCathode - vAnode;
        const forwardVoltage = zener.getForwardVoltage();
        const breakdownVoltage = zener.getBreakdownVoltage();
        const dynamicResistance = props.dynamicResistance || 10;
        const fwd = ctx.evaluatePnCompanion(
          vForward,
          forwardVoltage,
          dynamicResistance,
        );
        let totalG = fwd.g;
        let totalI = fwd.i;
        if (vReverse > breakdownVoltage) {
          const rev = ctx.evaluatePnCompanion(
            vReverse,
            breakdownVoltage,
            dynamicResistance,
          );
          totalG += rev.g;
          totalI -= rev.i;
        }
        const iEq = totalI - totalG * vForward;
        ctx.addTwoNodeConductance(nAnode, nCathode, totalG);
        ctx.addTwoNodeCurrentSource(nAnode, nCathode, iEq);
        return vs;
      },
    });
  }
}
