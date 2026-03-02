import {
  CircuitComponent,
  Connection,
  SimulationResults,
} from "../types/Circuit";
import { create, lusolve, Matrix } from "mathjs";

const math = create({});

export class CircuitSolver {
  private components: CircuitComponent[];
  private connections: Connection[];
  private nodeMap: Map<string, number> = new Map();
  private nodeCount = 0;

  constructor(components: CircuitComponent[], connections: Connection[]) {
    this.components = components;
    this.connections = connections;
    this.buildNodeMap();
  }

  private buildNodeMap() {
    // Build node mapping from connections
    // Ground node is always node 0
    this.nodeMap.set("ground", 0);
    this.nodeCount = 1;

    // Find all unique nodes from connections
    const uniqueNodes = new Set<string>();

    this.connections.forEach((conn) => {
      uniqueNodes.add(conn.fromPin);
      uniqueNodes.add(conn.toPin);
    });

    // Add ground connections for components that need them
    this.components.forEach((comp) => {
      if (comp.type === "ground") {
        comp.pins.forEach((pin) => {
          this.nodeMap.set(pin.id, 0); // Ground is node 0
        });
      }
    });

    // Map non-ground nodes
    uniqueNodes.forEach((nodeId) => {
      if (!this.nodeMap.has(nodeId) && nodeId !== "ground") {
        this.nodeMap.set(nodeId, this.nodeCount++);
      }
    });
  }

  public solve(): SimulationResults {
    try {
      // Create the conductance matrix G and current vector I
      const size = this.nodeCount;
      const G = math.zeros([size, size]) as Matrix;
      const I = math.zeros([size, 1]) as Matrix;

      // Process each component
      this.components.forEach((component) => {
        this.addComponentToMatrix(component, G, I);
      });

      // Solve G * V = I for voltages
      const V = lusolve(G, I);

      // Extract results
      const nodeVoltages: Record<string, number> = {};
      const componentCurrents: Record<string, number> = {};
      const componentPowers: Record<string, number> = {};

      // Map node voltages
      for (const [nodeId, nodeIndex] of this.nodeMap.entries()) {
        nodeVoltages[nodeId] =
          nodeIndex === 0 ? 0 : (V as any).get([nodeIndex, 0]);
      }

      // Calculate component currents and powers
      this.components.forEach((component) => {
        const result = this.calculateComponentValues(component, nodeVoltages);
        componentCurrents[component.id] = result.current;
        componentPowers[component.id] = result.power;
      });

      return {
        nodeVoltages,
        componentCurrents,
        componentPowers,
        isValid: true,
        errors: [],
        warnings: this.getWarnings(componentCurrents, componentPowers),
      };
    } catch (error) {
      return {
        nodeVoltages: {},
        componentCurrents: {},
        componentPowers: {},
        isValid: false,
        errors: [
          error instanceof Error ? error.message : "Unknown simulation error",
        ],
        warnings: [],
      };
    }
  }

  private addComponentToMatrix(
    component: CircuitComponent,
    G: Matrix,
    I: Matrix
  ) {
    if (component.pins.length < 2) return;

    const pin1 = component.pins[0].id;
    const pin2 = component.pins[1].id;
    const node1 = this.nodeMap.get(pin1) ?? -1;
    const node2 = this.nodeMap.get(pin2) ?? -1;

    if (node1 === -1 || node2 === -1) return;

    switch (component.type) {
      case "resistor":
        this.addResistor(component, node1, node2, G);
        break;
      case "battery":
        this.addVoltageSource(component, node1, node2, G, I);
        break;
      case "led":
      case "diode":
        // Simplified as resistor with forward voltage drop
        this.addDiode(component, node1, node2, G, I);
        break;
    }
  }

  private addResistor(
    component: CircuitComponent,
    node1: number,
    node2: number,
    G: Matrix
  ) {
    const resistance = component.properties.resistance ?? 1000;
    const conductance = 1 / resistance;

    // Add to conductance matrix
    if (node1 !== 0) {
      G.set([node1, node1], (G.get([node1, node1]) as number) + conductance);
      if (node2 !== 0) {
        G.set([node1, node2], (G.get([node1, node2]) as number) - conductance);
      }
    }
    if (node2 !== 0) {
      G.set([node2, node2], (G.get([node2, node2]) as number) + conductance);
      if (node1 !== 0) {
        G.set([node2, node1], (G.get([node2, node1]) as number) - conductance);
      }
    }
  }

  private addVoltageSource(
    component: CircuitComponent,
    node1: number,
    node2: number,
    G: Matrix,
    I: Matrix
  ) {
    const voltage = component.properties.voltage ?? 9;

    // Simplified: add as very small resistance with current source
    const internalR = 0.001;
    const current = voltage / internalR;

    this.addResistor(
      { ...component, properties: { resistance: internalR } },
      node1,
      node2,
      G
    );

    // Add current source
    if (node1 !== 0) {
      I.set([node1, 0], (I.get([node1, 0]) as number) + current);
    }
    if (node2 !== 0) {
      I.set([node2, 0], (I.get([node2, 0]) as number) - current);
    }
  }

  private addDiode(
    component: CircuitComponent,
    node1: number,
    node2: number,
    G: Matrix,
    _I: Matrix
  ) {
    // Simplified diode model: forward resistance + voltage drop
    const forwardResistance = 10; // ohms when conducting

    // Add as resistor for now (could be improved with iterative solving)
    this.addResistor(
      { ...component, properties: { resistance: forwardResistance } },
      node1,
      node2,
      G
    );
  }

  private calculateComponentValues(
    component: CircuitComponent,
    nodeVoltages: Record<string, number>
  ) {
    if (component.pins.length < 2) return { current: 0, power: 0 };

    const pin1 = component.pins[0].id;
    const pin2 = component.pins[1].id;
    const v1 = nodeVoltages[pin1] ?? 0;
    const v2 = nodeVoltages[pin2] ?? 0;
    const voltage = Math.abs(v1 - v2);

    let current = 0;
    let power = 0;

    switch (component.type) {
      case "resistor":
        current = voltage / (component.properties.resistance ?? 1000);
        power = voltage * current;
        break;
      case "led":
      case "diode":
        const resistance = 10; // Forward resistance
        current = Math.max(0, voltage / resistance);
        power = voltage * current;
        break;
      case "battery":
        current = 0.001; // Placeholder
        power = (component.properties.voltage ?? 9) * current;
        break;
    }

    return { current, power };
  }

  private getWarnings(
    currents: Record<string, number>,
    powers: Record<string, number>
  ): string[] {
    const warnings: string[] = [];

    this.components.forEach((component) => {
      const current = currents[component.id];
      const power = powers[component.id];

      if (component.type === "led" && current > 0.02) {
        warnings.push(
          `LED ${component.id} current is high (${(current * 1000).toFixed(1)}mA) - it might burn out!`
        );
      }

      if (component.type === "resistor" && power > 0.25) {
        warnings.push(
          `Resistor ${component.id} is dissipating high power (${(power * 1000).toFixed(1)}mW)`
        );
      }
    });

    return warnings;
  }
}
