import { CircuitComponent } from "./CircuitComponent";
import { Resistor } from "./components/Resistor";
import { Capacitor } from "./components/Capacitor";

export interface CircuitNode {
  id: string;
  voltage: number;
  components: string[]; // Component IDs connected to this node
}

export interface CircuitEquation {
  nodeId: string;
  coefficients: Map<string, number>; // nodeId -> coefficient
  constant: number;
}

/**
 * Circuit solver using Modified Nodal Analysis (MNA)
 * Supports DC analysis and time-domain simulation
 */
export class CircuitSolver {
  private components: Map<string, CircuitComponent>;
  private nodes: Map<string, CircuitNode>;
  private groundNode: string = "ground";
  private equations: CircuitEquation[];

  // Time-domain simulation
  private timeStep: number = 1e-6; // 1μs default
  private currentTime: number = 0;

  // Matrix solver workspace
  private matrixA: number[][];
  private vectorB: number[];
  private vectorX: number[];

  constructor() {
    this.components = new Map();
    this.nodes = new Map();
    this.equations = [];
    this.matrixA = [];
    this.vectorB = [];
    this.vectorX = [];

    // Always create ground node
    this.nodes.set(this.groundNode, {
      id: this.groundNode,
      voltage: 0,
      components: [],
    });
  }

  /**
   * Add a component to the circuit
   */
  public addComponent(component: CircuitComponent): void {
    const id = component.getName();
    this.components.set(id, component);

    // Register component nodes
    const componentNodes = component.getNodes();
    componentNodes.forEach((node) => {
      const globalNodeId = `${id}_${node.id}`;

      if (!this.nodes.has(globalNodeId)) {
        this.nodes.set(globalNodeId, {
          id: globalNodeId,
          voltage: 0,
          components: [],
        });
      }

      this.nodes.get(globalNodeId)!.components.push(id);
    });

    console.log(`🔌 Added component ${id} to circuit`);
  }

  /**
   * Remove a component from the circuit
   */
  public removeComponent(componentId: string): void {
    const component = this.components.get(componentId);
    if (!component) return;

    // Remove from nodes
    this.nodes.forEach((node) => {
      node.components = node.components.filter((id) => id !== componentId);
    });

    // Remove empty nodes (except ground)
    const nodesToRemove: string[] = [];
    this.nodes.forEach((node, nodeId) => {
      if (nodeId !== this.groundNode && node.components.length === 0) {
        nodesToRemove.push(nodeId);
      }
    });

    nodesToRemove.forEach((nodeId) => this.nodes.delete(nodeId));
    this.components.delete(componentId);

    console.log(`🔌 Removed component ${componentId} from circuit`);
  }

  /**
   * Connect two component nodes together
   */
  public connectNodes(
    comp1Id: string,
    node1Id: string,
    comp2Id: string,
    node2Id: string
  ): void {
    const globalNode1 = `${comp1Id}_${node1Id}`;
    const globalNode2 = `${comp2Id}_${node2Id}`;

    // Merge nodes - keep the first one and redirect the second
    const node1 = this.nodes.get(globalNode1);
    const node2 = this.nodes.get(globalNode2);

    if (!node1 || !node2) {
      console.error(
        `Cannot connect nodes: ${globalNode1} or ${globalNode2} not found`
      );
      return;
    }

    // Merge component lists
    node1.components = [...new Set([...node1.components, ...node2.components])];

    // Redirect all references to node2 to point to node1
    this.nodes.delete(globalNode2);

    console.log(`🔗 Connected ${globalNode1} to ${globalNode2}`);
  }

  /**
   * Solve DC operating point
   */
  public solveDC(): boolean {
    console.log("⚡ Starting DC analysis...");

    try {
      this.buildDCEquations();
      this.solveLinearSystem();
      this.updateComponentStates();

      console.log("✅ DC analysis complete");
      return true;
    } catch (error) {
      console.error("❌ DC analysis failed:", error);
      return false;
    }
  }

  /**
   * Perform time-domain simulation step
   */
  public simulateTimeStep(deltaTime: number): boolean {
    this.timeStep = deltaTime;
    this.currentTime += deltaTime;

    try {
      this.buildTransientEquations();
      this.solveLinearSystem();
      this.updateComponentStates();
      this.updateReactiveComponents(deltaTime);

      return true;
    } catch (error) {
      console.error("❌ Time-domain simulation failed:", error);
      return false;
    }
  }

  /**
   * Build DC equations using Modified Nodal Analysis
   */
  private buildDCEquations(): void {
    this.equations = [];
    const nodeList = Array.from(this.nodes.keys()).filter(
      (id) => id !== this.groundNode
    );
    const numNodes = nodeList.length;

    // Initialize matrices
    this.matrixA = Array(numNodes)
      .fill(0)
      .map(() => Array(numNodes).fill(0));
    this.vectorB = Array(numNodes).fill(0);
    this.vectorX = Array(numNodes).fill(0);

    // Apply Kirchhoff's Current Law (KCL) at each node
    nodeList.forEach((nodeId, nodeIndex) => {
      const node = this.nodes.get(nodeId)!;

      // Sum currents leaving this node = 0
      node.components.forEach((compId) => {
        const component = this.components.get(compId)!;
        this.addComponentToEquation(component, nodeId, nodeIndex, nodeList);
      });
    });
  }

  /**
   * Build transient equations including reactive components
   */
  private buildTransientEquations(): void {
    // Similar to DC but include capacitor and inductor dynamics
    this.buildDCEquations();

    // Add reactive component contributions
    this.components.forEach((component) => {
      if (component.getComponentType() === "capacitor") {
        this.addCapacitorTransient(component as Capacitor);
      }
      // Add inductor handling when implemented
    });
  }

  /**
   * Add component contribution to node equation
   */
  private addComponentToEquation(
    component: CircuitComponent,
    nodeId: string,
    nodeIndex: number,
    nodeList: string[]
  ): void {
    const componentType = component.getComponentType();

    switch (componentType) {
      case "resistor":
        this.addResistorToEquation(
          component as Resistor,
          nodeId,
          nodeIndex,
          nodeList
        );
        break;
      case "battery":
        this.addVoltageSourceToEquation(component, nodeId, nodeIndex, nodeList);
        break;
      case "capacitor":
        this.addCapacitorToEquation(
          component as Capacitor,
          nodeId,
          nodeIndex,
          nodeList
        );
        break;
      // Add other component types as needed
    }
  }

  /**
   * Add resistor to node equation: I = (V1 - V2) / R
   */
  private addResistorToEquation(
    resistor: Resistor,
    nodeId: string,
    nodeIndex: number,
    nodeList: string[]
  ): void {
    const resistance = resistor.getResistance();
    const conductance = 1 / resistance;
    const nodes = resistor.getNodes();

    // Find the other node this resistor connects to
    const resistorId = resistor.getName();
    const thisNodeGlobal = `${resistorId}_${nodes[0].id}`;
    const otherNodeGlobal = `${resistorId}_${nodes[1].id}`;

    let otherNodeIndex = -1;
    if (nodeId === thisNodeGlobal) {
      otherNodeIndex = nodeList.indexOf(otherNodeGlobal);
    } else {
      otherNodeIndex = nodeList.indexOf(thisNodeGlobal);
    }

    // Add conductance to diagonal (current node)
    this.matrixA[nodeIndex][nodeIndex] += conductance;

    // Subtract conductance from off-diagonal (other node)
    if (otherNodeIndex >= 0) {
      this.matrixA[nodeIndex][otherNodeIndex] -= conductance;
    }
    // If other node is ground, no contribution to matrix (ground = 0V)
  }

  /**
   * Add voltage source to equation
   */
  private addVoltageSourceToEquation(
    battery: CircuitComponent,
    nodeId: string,
    nodeIndex: number,
    nodeList: string[]
  ): void {
    const voltage = battery.getCircuitProperties().value;
    const nodes = battery.getNodes();

    // Determine if this is positive or negative terminal
    const batteryId = battery.getName();
    const positiveNode = `${batteryId}_${nodes[0].id}`;

    if (nodeId === positiveNode) {
      // Current flows out of positive terminal
      this.vectorB[nodeIndex] += voltage / 1e-6; // Add current source equivalent
    } else {
      // Current flows into negative terminal
      this.vectorB[nodeIndex] -= voltage / 1e-6;
    }
  }

  /**
   * Add capacitor to DC equation (open circuit)
   */
  private addCapacitorToEquation(
    capacitor: Capacitor,
    nodeId: string,
    nodeIndex: number,
    nodeList: string[]
  ): void {
    // For DC analysis, capacitor is open circuit (no contribution)
    // For transient analysis, this is handled separately
  }

  /**
   * Add capacitor transient behavior
   */
  private addCapacitorTransient(capacitor: Capacitor): void {
    // I = C * dV/dt
    // Use backward Euler: I = C * (V_new - V_old) / dt
    const capacitance = capacitor.getCapacitance();
    const nodes = capacitor.getNodes();
    const capId = capacitor.getName();

    const node1Global = `${capId}_${nodes[0].id}`;
    const node2Global = `${capId}_${nodes[1].id}`;

    // Find node indices
    const nodeList = Array.from(this.nodes.keys()).filter(
      (id) => id !== this.groundNode
    );
    const node1Index = nodeList.indexOf(node1Global);
    const node2Index = nodeList.indexOf(node2Global);

    const dtFactor = capacitance / this.timeStep;

    if (node1Index >= 0) {
      this.matrixA[node1Index][node1Index] += dtFactor;
      if (node2Index >= 0) {
        this.matrixA[node1Index][node2Index] -= dtFactor;
      }

      // Add previous voltage contribution
      const prevVoltage = capacitor.getCircuitProperties().voltage;
      this.vectorB[node1Index] += dtFactor * prevVoltage;
    }

    if (node2Index >= 0) {
      this.matrixA[node2Index][node2Index] += dtFactor;
      if (node1Index >= 0) {
        this.matrixA[node2Index][node1Index] -= dtFactor;
      }

      const prevVoltage = capacitor.getCircuitProperties().voltage;
      this.vectorB[node2Index] -= dtFactor * prevVoltage;
    }
  }

  /**
   * Solve linear system Ax = b using Gaussian elimination
   */
  private solveLinearSystem(): void {
    const n = this.matrixA.length;

    // Forward elimination
    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(this.matrixA[k][i]) > Math.abs(this.matrixA[maxRow][i])) {
          maxRow = k;
        }
      }

      // Swap rows
      [this.matrixA[i], this.matrixA[maxRow]] = [
        this.matrixA[maxRow],
        this.matrixA[i],
      ];
      [this.vectorB[i], this.vectorB[maxRow]] = [
        this.vectorB[maxRow],
        this.vectorB[i],
      ];

      // Make all rows below this one 0 in current column
      for (let k = i + 1; k < n; k++) {
        const factor = this.matrixA[k][i] / this.matrixA[i][i];
        for (let j = i; j < n; j++) {
          this.matrixA[k][j] -= factor * this.matrixA[i][j];
        }
        this.vectorB[k] -= factor * this.vectorB[i];
      }
    }

    // Back substitution
    for (let i = n - 1; i >= 0; i--) {
      this.vectorX[i] = this.vectorB[i];
      for (let j = i + 1; j < n; j++) {
        this.vectorX[i] -= this.matrixA[i][j] * this.vectorX[j];
      }
      this.vectorX[i] /= this.matrixA[i][i];
    }
  }

  /**
   * Update component states with solved voltages and currents
   */
  private updateComponentStates(): void {
    const nodeList = Array.from(this.nodes.keys()).filter(
      (id) => id !== this.groundNode
    );

    // Update node voltages
    nodeList.forEach((nodeId, index) => {
      const node = this.nodes.get(nodeId)!;
      node.voltage = this.vectorX[index];
    });

    // Update component voltages and currents
    this.components.forEach((component) => {
      const nodes = component.getNodes();
      const compId = component.getName();

      if (nodes.length >= 2) {
        const node1Global = `${compId}_${nodes[0].id}`;
        const node2Global = `${compId}_${nodes[1].id}`;

        const voltage1 = this.nodes.get(node1Global)?.voltage || 0;
        const voltage2 = this.nodes.get(node2Global)?.voltage || 0;
        const voltageDiff = voltage1 - voltage2;

        // Calculate current based on component type
        let current = 0;
        const componentType = component.getComponentType();

        switch (componentType) {
          case "resistor":
            current = voltageDiff / (component as Resistor).getResistance();
            break;
          case "capacitor":
            // For transient: I = C * dV/dt
            const prevVoltage = component.getCircuitProperties().voltage;
            const dVdt = (voltageDiff - prevVoltage) / this.timeStep;
            current = (component as Capacitor).getCapacitance() * dVdt;
            break;
          case "battery":
            // Current determined by circuit, voltage is fixed
            // This requires more sophisticated handling
            current = 0; // Placeholder
            break;
        }

        component.updateCircuitState(voltageDiff, current);
      }
    });
  }

  /**
   * Update reactive components for time-domain simulation
   */
  private updateReactiveComponents(deltaTime: number): void {
    this.components.forEach((component) => {
      if (component.getComponentType() === "capacitor") {
        const capacitor = component as Capacitor;
        const voltage = component.getCircuitProperties().voltage;
        capacitor.updateTransient(deltaTime, voltage);
      }
      // Add inductor updates when implemented
    });
  }

  /**
   * Get current simulation time
   */
  public getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * Reset simulation
   */
  public reset(): void {
    this.currentTime = 0;

    // Reset all component states
    this.components.forEach((component) => {
      component.updateCircuitState(0, 0);
    });

    // Reset node voltages
    this.nodes.forEach((node) => {
      if (node.id !== this.groundNode) {
        node.voltage = 0;
      }
    });

    console.log("🔄 Circuit solver reset");
  }

  /**
   * Get circuit analysis results
   */
  public getAnalysisResults(): any {
    const results = {
      nodes: Array.from(this.nodes.entries()).map(([id, node]) => ({
        id,
        voltage: node.voltage,
        components: node.components,
      })),
      components: Array.from(this.components.entries()).map(([id, comp]) => ({
        id,
        type: comp.getComponentType(),
        properties: comp.getCircuitProperties(),
      })),
      time: this.currentTime,
    };

    return results;
  }
}
