export interface Point {
  x: number;
  y: number;
}

export interface ComponentPin {
  id: string;
  position: Point;
  type:
    | "input"
    | "output"
    | "bidirectional"
    | "positive"
    | "negative"
    | "terminal"
    | "cathode"
    | "anode"
    | "ground";
  connectedTo?: string[]; // Connection IDs
  label?: string; // Display label for pin
}

export interface CircuitComponent {
  id: string;
  type: ComponentType;
  position: Point;
  rotation: number;
  properties: ComponentProperties;
  pins: ComponentPin[];
  isSelected?: boolean;
  isHighlighted?: boolean;
}

export type ComponentType =
  | "resistor"
  | "capacitor"
  | "inductor"
  | "diode"
  | "led"
  | "battery"
  | "switch"
  | "voltmeter"
  | "ammeter"
  | "ground"
  | "wire";

export interface ComponentProperties {
  // Resistor
  resistance?: number; // Ohms

  // Capacitor
  capacitance?: number; // Farads
  unit?: string; // Display unit

  // Inductor
  inductance?: number; // Henries

  // Battery/Voltage Source
  voltage?: number; // Volts

  // LED/Diode
  forwardVoltage?: number;
  maxCurrent?: number;

  // Switch
  isOpen?: boolean;
  closed?: boolean; // Alternative switch state

  // Voltmeter/Ammeter
  reading?: number; // Current reading

  // Display name
  label?: string;
  value?: string;

  // Visual properties
  color?: string;
  size?: { width: number; height: number };
}

export interface Connection {
  id: string;
  fromPin: string; // Pin ID
  toPin: string; // Pin ID
  points: Point[]; // Original wire routing points (direct endpoints)
  routedPath?: Point[]; // Auto-routed Manhattan path with obstacle avoidance
  current?: number; // Amperes (calculated)
  isHighlighted?: boolean;
}

export interface SimulationResults {
  nodeVoltages: Record<string, number>; // Node ID -> Voltage
  componentCurrents: Record<string, number>; // Component ID -> Current
  componentPowers: Record<string, number>; // Component ID -> Power
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CircuitState {
  components: CircuitComponent[];
  connections: Connection[];
  isSimulating: boolean;
  selectedComponent: CircuitComponent | null;
  results: SimulationResults | null;
  selectedTool: string | null;
  showGrid: boolean;
}

export interface DragState {
  isDragging: boolean;
  draggedComponent: CircuitComponent | null;
  offset: Point;
  startPosition: Point;
}
