import { CircuitComponent } from "../CircuitComponent";
import { CircuitNetlist } from "./CircuitNetlist";
import { AcSourceStamper } from "./componentStampers/AcSourceStamper";
import { AmmeterStamper } from "./componentStampers/AmmeterStamper";
import { BatteryStamper } from "./componentStampers/BatteryStamper";
import { CapacitorStamper } from "./componentStampers/CapacitorStamper";
import {
  ComponentStamper,
  ComponentStamperContext,
} from "./componentStampers/ComponentStamper";
import { ComparatorStamper } from "./componentStampers/ComparatorStamper";
import { DiodeStamper } from "./componentStampers/DiodeStamper";
import { GroundStamper } from "./componentStampers/GroundStamper";
import { InductorStamper } from "./componentStampers/InductorStamper";
import { LedStamper } from "./componentStampers/LedStamper";
import { LogicGateStamper } from "./componentStampers/LogicGateStamper";
import { NmosStamper } from "./componentStampers/NmosStamper";
import { NpnTransistorStamper } from "./componentStampers/NpnTransistorStamper";
import { OpAmpStamper } from "./componentStampers/OpAmpStamper";
import { OscilloscopeStamper } from "./componentStampers/OscilloscopeStamper";
import { PmosStamper } from "./componentStampers/PmosStamper";
import { PnpTransistorStamper } from "./componentStampers/PnpTransistorStamper";
import { PotentiometerStamper } from "./componentStampers/PotentiometerStamper";
import { PushButtonStamper } from "./componentStampers/PushButtonStamper";
import { RelayStamper } from "./componentStampers/RelayStamper";
import { ResistorStamper } from "./componentStampers/ResistorStamper";
import { SpdtSwitchStamper } from "./componentStampers/SpdtSwitchStamper";
import { SwitchStamper } from "./componentStampers/SwitchStamper";
import { Timer555Stamper } from "./componentStampers/Timer555Stamper";
import { VoltmeterStamper } from "./componentStampers/VoltmeterStamper";
import { ZenerStamper } from "./componentStampers/ZenerStamper";

export const LOGIC_GATE_TYPES = [
  "nor_gate",
  "nand_gate",
  "and_gate",
  "or_gate",
  "xor_gate",
  "not_gate",
] as const;

export const VOLTAGE_SOURCE_COMPONENT_TYPES = new Set<string>([
  "battery",
  "acsource",
  "opamp",
  "comparator",
  "timer555",
  ...LOGIC_GATE_TYPES,
]);

export function populateNetlistFromComponents(
  components: Map<string, CircuitComponent>,
  netlist: CircuitNetlist,
  runtime: Omit<ComponentStamperContext, "netlist" | "inTransientStamping">,
  options: {
    inTransientStamping: boolean;
    onUnknownType: (type: string) => void;
  },
): void {
  const context: ComponentStamperContext = {
    netlist,
    inTransientStamping: options.inTransientStamping,
    ...runtime,
  };
  const registry = createComponentStamperRegistry();
  components.forEach((component) => {
    const type = component.getComponentType();
    const stamper = registry.get(type);
    if (!stamper) {
      options.onUnknownType(type);
      return;
    }
    stamper.stamp(component, context);
  });
}

function createComponentStamperRegistry(): Map<string, ComponentStamper> {
  const map = new Map<string, ComponentStamper>();
  const stampers: ComponentStamper[] = [
    new ResistorStamper(),
    new BatteryStamper(),
    new AcSourceStamper(),
    new CapacitorStamper(),
    new InductorStamper(),
    new LedStamper(),
    new DiodeStamper(),
    new NpnTransistorStamper(),
    new PnpTransistorStamper(),
    new SwitchStamper(),
    new PushButtonStamper(),
    new SpdtSwitchStamper(),
    new PotentiometerStamper(),
    new AmmeterStamper(),
    new VoltmeterStamper(),
    new OscilloscopeStamper(),
    new ZenerStamper(),
    new NmosStamper(),
    new PmosStamper(),
    new OpAmpStamper(),
    new ComparatorStamper(),
    new Timer555Stamper(),
    new RelayStamper(),
    ...LOGIC_GATE_TYPES.map((t) => new LogicGateStamper(t)),
    new GroundStamper(),
  ];
  for (const stamper of stampers) {
    map.set(stamper.type, stamper);
  }
  return map;
}
