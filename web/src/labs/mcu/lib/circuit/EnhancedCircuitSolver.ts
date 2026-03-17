import { lusolve, matrix, Matrix } from "mathjs";
import { CircuitComponent } from "./CircuitComponent";
import { Resistor } from "./components/Resistor";
import { Capacitor } from "./components/Capacitor";
import { Battery } from "./components/Battery";
import { Inductor } from "./components/Inductor";
import { LED } from "./components/LED";
import { Switch } from "./components/Switch";
import { Ammeter } from "./components/Ammeter";
import { ACSource } from "./components/ACSource";
import { NPNTransistor } from "./components/NPNTransistor";
import { PNPTransistor } from "./components/PNPTransistor";

/**
 * Enhanced Circuit Solver using Modified Nodal Analysis (MNA) with MathJS
 *
 * This solver properly handles:
 * - Multiple voltage sources
 * - Complex circuit topologies
 * - Transient analysis (capacitors, inductors)
 * - Accurate voltage and current calculations
 */
export class EnhancedCircuitSolver {
  private components: Map<string, CircuitComponent>;
  private nodeMap: Map<string, number>; // Global node ID -> matrix index
  private nodeConnections: Map<string, Set<string>>; // Track which nodes are connected
  private voltageSourceCount: number = 0;
  private voltageSourceMap: Map<string, number>; // Component ID -> voltage source index

  // MNA Matrices
  private G: number[][]; // Conductance matrix (n×n)
  private B: number[][]; // Voltage source connection matrix (n×m)
  private C: number[][]; // Transpose of B (m×n)
  private D: number[][]; // Coupling matrix (m×m) - usually zeros
  private i: number[]; // Current source vector (n×1)
  private e: number[]; // Voltage source vector (m×1)

  // Transient analysis
  private timeStep: number = 1e-3; // 1ms default
  private currentTime: number = 0;
  private previousState: Map<string, { voltage: number; current: number }>;

  constructor() {
    this.components = new Map();
    this.nodeMap = new Map();
    this.nodeConnections = new Map();
    this.previousState = new Map();
    this.voltageSourceMap = new Map();

    // Ground node is always index 0 (not included in matrix)
    this.nodeMap.set("ground", 0);

    // Initialize matrices
    this.G = [];
    this.B = [];
    this.C = [];
    this.D = [];
    this.i = [];
    this.e = [];
  }

  /**
   * Add a component to the circuit
   */
  public addComponent(component: CircuitComponent): void {
    const componentId = component.getName();
    this.components.set(componentId, component);

    // Register component nodes
    this.registerComponentNodes(component);

    console.log(`🔌 Added ${componentId} to enhanced solver`);
  }

  /**
   * Remove a component from the circuit
   */
  public removeComponent(componentId: string): void {
    const component = this.components.get(componentId);
    if (!component) return;

    // Remove component
    this.components.delete(componentId);

    // Rebuild node map (simpler than selective removal)
    this.rebuildNodeMap();

    console.log(`🔌 Removed ${componentId} from solver`);
  }

  /**
   * Disconnect two nodes (inverse of connectNodes)
   */
  public disconnectNodes(
    comp1Id: string,
    node1Id: string,
    comp2Id: string,
    node2Id: string
  ): void {
    const globalNode1 = `${comp1Id}_${node1Id}`;
    const globalNode2 = `${comp2Id}_${node2Id}`;

    const set1 = this.nodeConnections.get(globalNode1);
    const set2 = this.nodeConnections.get(globalNode2);
    if (set1) set1.delete(globalNode2);
    if (set2) set2.delete(globalNode1);

    // Clean empty entries
    if (set1 && set1.size === 0) this.nodeConnections.delete(globalNode1);
    if (set2 && set2.size === 0) this.nodeConnections.delete(globalNode2);

    // Rebuild matrices to reflect topology change
    this.rebuildNodeMap();
    console.log(`🔗 SOLVER: Disconnected ${globalNode1} ⨯ ${globalNode2}`);
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

    console.log(`🔗 SOLVER: Connecting ${globalNode1} ↔ ${globalNode2}`);

    // Track connection
    if (!this.nodeConnections.has(globalNode1)) {
      this.nodeConnections.set(globalNode1, new Set());
    }
    if (!this.nodeConnections.has(globalNode2)) {
      this.nodeConnections.set(globalNode2, new Set());
    }

    this.nodeConnections.get(globalNode1)!.add(globalNode2);
    this.nodeConnections.get(globalNode2)!.add(globalNode1);

    console.log(
      `   Before rebuild: ${this.nodeConnections.size} tracked nodes`
    );

    // Rebuild node map to merge connected nodes
    this.rebuildNodeMap();

    console.log(`   After rebuild: Node map size = ${this.nodeMap.size}`);
    console.log(`🔗 ✅ Connected ${globalNode1} ↔ ${globalNode2}`);
  }

  /**
   * Solve DC operating point
   */
  public solveDC(): boolean {
    console.log("⚡ Starting enhanced DC analysis...");
    console.log(`   📦 Components: ${this.components.size}`);
    console.log(`   🔗 Connections: ${this.nodeConnections.size}`);

    // Debug: Show which nodes are connected
    this.nodeConnections.forEach((connections, nodeId) => {
      if (connections.size > 0) {
        console.log(
          `   🔗 ${nodeId} → [${Array.from(connections).join(", ")}]`
        );
      }
    });

    try {
      // Reset all node voltages to 0V before starting iterations
      // This ensures we start from a clean state on each DC analysis
      console.log("🔄 Resetting all node voltages to 0V...");
      this.components.forEach((component) => {
        component.getNodes().forEach((node) => {
          const prevVoltage = node.voltage;
          node.voltage = 0;
          if (prevVoltage !== 0) {
            console.log(
              `   Reset ${component.getName()}_${node.id}: ${prevVoltage.toFixed(3)}V → 0V`
            );
          }
        });
      });
      console.log("✅ Node voltage reset complete");

      // Iterative Newton-Raphson for non-linear components (transistors, LEDs)
      const maxIterations = 10;
      const convergenceTolerance = 0.001; // 1mV tolerance
      let converged = false;

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        // Store previous voltages for convergence check
        const previousVoltages = new Map<string, number>();
        this.components.forEach((component) => {
          component.getNodes().forEach((node) => {
            const nodeId = `${component.getName()}_${node.id}`;
            previousVoltages.set(nodeId, node.voltage);
          });
        });

        // Build matrices and solve
        this.buildMNAMatrices();
        const solution = this.solveMNA();
        this.updateComponentStates(solution);

        // Check for convergence
        let maxChange = 0;
        this.components.forEach((component) => {
          component.getNodes().forEach((node) => {
            const nodeId = `${component.getName()}_${node.id}`;
            const prevVoltage = previousVoltages.get(nodeId) || 0;
            const change = Math.abs(node.voltage - prevVoltage);
            maxChange = Math.max(maxChange, change);
          });
        });

        if (maxChange < convergenceTolerance) {
          converged = true;
          break;
        }
      }

      if (!converged) {
        console.warn(
          "   ⚠️ Did not converge within max iterations, using last solution"
        );
      }

      console.log("✅ Enhanced DC analysis complete");
      return true;
    } catch (error) {
      console.error("❌ Enhanced DC analysis failed:", error);
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
      // Iterative Newton-Raphson for non-linear components (transistors, LEDs)
      // Similar to solveDC() but preserves previous time step state for reactive components
      const maxIterations = 20; // Increased for better convergence with high-impedance circuits
      const convergenceTolerance = 0.01; // 10mV tolerance (tight enough to ensure stability)
      const minChangeThreshold = 0.001; // 1mV minimum change to consider (ignore tiny fluctuations)

      // Reset node voltages to previous stable state before iteration
      // This prevents oscillations from building up
      const stableVoltages = new Map<string, number>();
      this.components.forEach((component) => {
        component.getNodes().forEach((node) => {
          const nodeId = `${component.getName()}_${node.id}`;
          stableVoltages.set(nodeId, node.voltage);
        });
      });

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        // Store previous voltages for convergence check
        const previousVoltages = new Map<string, number>();
        this.components.forEach((component) => {
          component.getNodes().forEach((node) => {
            const nodeId = `${component.getName()}_${node.id}`;
            previousVoltages.set(nodeId, node.voltage);
          });
        });

        // Build matrices and solve
        this.buildTransientMatrices();
        const solution = this.solveMNA();
        this.updateComponentStates(solution);

        // Apply MODERATE damping to prevent oscillations (blend old and new voltages)
        // Balance between convergence speed and stability
        const dampingFactor = 0.5; // 50% of new solution, 50% of old (balanced)
        this.components.forEach((component) => {
          component.getNodes().forEach((node) => {
            const nodeId = `${component.getName()}_${node.id}`;
            const oldVoltage = previousVoltages.get(nodeId) || 0;
            const newVoltage = node.voltage;
            // Apply damping to smooth out oscillations
            node.voltage =
              dampingFactor * newVoltage + (1 - dampingFactor) * oldVoltage;
          });
        });

        // Check for convergence
        let maxChange = 0;
        let significantChanges = 0; // Count changes above minimum threshold
        this.components.forEach((component) => {
          component.getNodes().forEach((node) => {
            const nodeId = `${component.getName()}_${node.id}`;
            const prevVoltage = previousVoltages.get(nodeId) || 0;
            const change = Math.abs(node.voltage - prevVoltage);

            // Only count significant changes (ignore tiny numerical noise)
            if (change > minChangeThreshold) {
              maxChange = Math.max(maxChange, change);
              significantChanges++;
            }
          });
        });

        // Check for convergence
        if (maxChange < convergenceTolerance) {
          // Converged successfully
          break;
        } else if (iteration === maxIterations - 1) {
          // Did not converge - restore stable state to prevent wild oscillations
          // Restore previous stable voltages
          this.components.forEach((component) => {
            component.getNodes().forEach((node) => {
              const nodeId = `${component.getName()}_${node.id}`;
              node.voltage = stableVoltages.get(nodeId) || 0;
            });
          });
        }
      }

      this.storePreviousState();
      return true;
    } catch (error) {
      console.error("❌ Transient simulation failed:", error);
      return false;
    }
  }

  /**
   * Register component nodes and assign matrix indices
   */
  private registerComponentNodes(component: CircuitComponent): void {
    const nodes = component.getNodes();
    const componentId = component.getName();
    const componentType = component.getComponentType();

    nodes.forEach((node) => {
      const globalNodeId = `${componentId}_${node.id}`;

      // Ground components always map to ground node (index 0)
      if (componentType === "ground") {
        this.nodeMap.set(globalNodeId, 0);
        console.log(`   ⏚ Ground node ${globalNodeId} → index 0`);
      } else if (!this.nodeMap.has(globalNodeId)) {
        // Assign next available index (skip 0 = ground)
        const nextIndex = this.nodeMap.size;
        this.nodeMap.set(globalNodeId, nextIndex);
      }
    });
  }

  /**
   * Rebuild node map to handle connections and removals
   */
  private rebuildNodeMap(): void {
    // Find connected node groups using union-find
    const nodeGroups = this.findConnectedNodeGroups();

    // Rebuild map
    this.nodeMap.clear();
    this.nodeMap.set("ground", 0);

    let nextIndex = 1;

    // Assign same index to all nodes in a group
    nodeGroups.forEach((group) => {
      // Check if any node in this group is a ground component
      const hasGroundComponent = Array.from(group).some((nodeId) => {
        const [compId] = nodeId.split("_");
        const component = this.components.get(compId);
        return component?.getComponentType() === "ground";
      });

      // If group contains ground, all nodes map to index 0
      const groupIndex = hasGroundComponent ? 0 : nextIndex++;

      group.forEach((nodeId) => {
        this.nodeMap.set(nodeId, groupIndex);
      });

      if (hasGroundComponent) {
        console.log(
          `   ⏚ Ground group: ${Array.from(group).join(", ")} → index 0`
        );
      }
    });
  }

  /**
   * Find groups of connected nodes using union-find algorithm
   */
  private findConnectedNodeGroups(): Set<string>[] {
    const allNodes = new Set<string>();
    const visited = new Set<string>();
    const groups: Set<string>[] = [];

    // Collect all component nodes
    this.components.forEach((component) => {
      const componentId = component.getName();
      component.getNodes().forEach((node) => {
        allNodes.add(`${componentId}_${node.id}`);
      });
    });

    // DFS to find connected components
    const dfs = (nodeId: string, currentGroup: Set<string>) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      currentGroup.add(nodeId);

      const connections = this.nodeConnections.get(nodeId);
      if (connections) {
        connections.forEach((connectedNode) => {
          if (allNodes.has(connectedNode)) {
            dfs(connectedNode, currentGroup);
          }
        });
      }
    };

    // Find all connected groups
    allNodes.forEach((nodeId) => {
      if (!visited.has(nodeId)) {
        const group = new Set<string>();
        dfs(nodeId, group);
        if (group.size > 0) {
          groups.push(group);
        }
      }
    });

    return groups;
  }

  /**
   * Build MNA matrices for DC analysis
   */
  private buildMNAMatrices(): void {
    const nodeValues = Array.from(this.nodeMap.values()).filter((v) => v > 0);
    const numNodes = nodeValues.length > 0 ? Math.max(...nodeValues) : 0;
    if (numNodes === 0) return;
    this.voltageSourceCount = this.countVoltageSources();
    const m = this.voltageSourceCount;

    // Clear voltage source map before rebuilding
    this.voltageSourceMap.clear();

    // Initialize matrices
    this.G = Array(numNodes)
      .fill(0)
      .map(() => Array(numNodes).fill(0));
    this.B = Array(numNodes)
      .fill(0)
      .map(() => Array(m).fill(0));
    this.C = Array(m)
      .fill(0)
      .map(() => Array(numNodes).fill(0));
    this.D = Array(m)
      .fill(0)
      .map(() => Array(m).fill(0));
    this.i = Array(numNodes).fill(0);
    this.e = Array(m).fill(0);

    let vsIndex = 0;

    // Process each component
    this.components.forEach((component) => {
      const type = component.getComponentType();

      switch (type) {
        case "resistor":
          this.addResistor(component as Resistor);
          break;
        case "battery":
          vsIndex = this.addBattery(component as Battery, vsIndex);
          break;
        case "acsource":
          vsIndex = this.addACSource(component as ACSource, vsIndex);
          break;
        case "capacitor":
          // DC analysis: capacitor is open circuit (no contribution)
          break;
        case "inductor":
          // DC analysis: inductor is short circuit
          this.addInductorDC(component as Inductor);
          break;
        case "led":
          // LED: simplified model as resistor + voltage source (for kids)
          vsIndex = this.addLEDSimplified(component as LED, vsIndex);
          break;
        case "npn_transistor":
          // NPN BJT: model as controlled resistor (switch/amplifier)
          this.addNPNTransistor(component as NPNTransistor);
          break;
        case "pnp_transistor":
          // PNP BJT: model as controlled resistor (switch/amplifier)
          this.addPNPTransistor(component as PNPTransistor);
          break;
        case "switch":
          // Switch: acts as variable resistor (low when closed, high when open)
          this.addSwitch(component as Switch);
          break;
        case "ammeter":
          // Ammeter: acts as very low resistance
          this.addAmmeter(component as Ammeter);
          break;
        case "voltmeter":
        case "oscilloscope":
          // Voltmeter/Oscilloscope: acts as very high resistance
          this.addHighResistance(component);
          break;
        case "ground":
          // Ground is handled by node 0
          break;
        default:
          console.warn(`Component type ${type} not handled in MNA`);
      }
    });
  }

  /**
   * Build MNA matrices for transient analysis
   */
  private buildTransientMatrices(): void {
    // Start with DC matrices
    this.buildMNAMatrices();

    // Add reactive component contributions
    this.components.forEach((component) => {
      const type = component.getComponentType();

      if (type === "capacitor") {
        this.addCapacitorTransient(component as Capacitor);
      } else if (type === "inductor") {
        this.addInductorTransient(component as Inductor);
      }
    });
  }

  /**
   * Add resistor to MNA matrices
   * Uses conductance: G = 1/R
   * KCL: I = G * (V1 - V2)
   */
  private addResistor(resistor: Resistor): void {
    const resistance = resistor.getCircuitProperties().value;
    if (resistance <= 0) {
      console.warn(`Invalid resistance: ${resistance}Ω`);
      return;
    }

    const conductance = 1 / resistance;
    const nodes = resistor.getNodes();
    const componentId = resistor.getName();

    const n1 = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1; // -1 because matrix starts at index 0
    const n2 = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;

    // Add to G matrix using stamp method
    if (n1 >= 0) {
      this.G[n1][n1] += conductance;
      if (n2 >= 0) this.G[n1][n2] -= conductance;
    }
    if (n2 >= 0) {
      this.G[n2][n2] += conductance;
      if (n1 >= 0) this.G[n2][n1] -= conductance;
    }
  }

  /**
   * Add battery (voltage source) to MNA matrices
   * Voltage sources require extra current variables
   */
  private addBattery(battery: Battery, vsIndex: number): number {
    const voltage = battery.getCircuitProperties().value;
    const nodes = battery.getNodes();
    const componentId = battery.getName();

    // Store voltage source index for this battery
    this.voltageSourceMap.set(componentId, vsIndex);

    const n1 = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1; // Positive
    const n2 = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1; // Negative

    // Voltage source stamp
    if (n1 >= 0) {
      this.B[n1][vsIndex] = 1;
      this.C[vsIndex][n1] = 1;
    }
    if (n2 >= 0) {
      this.B[n2][vsIndex] = -1;
      this.C[vsIndex][n2] = -1;
    }

    this.e[vsIndex] = voltage;

    return vsIndex + 1;
  }

  /**
   * Add inductor for DC analysis (short circuit)
   */
  private addInductorDC(inductor: Inductor): void {
    // In DC steady state, inductor acts as short circuit (wire)
    // Add a very small resistance to avoid singular matrix
    const nodes = inductor.getNodes();
    const componentId = inductor.getName();

    const n1 = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
    const n2 = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;

    const conductance = 1e6; // Very high conductance (≈ short)

    if (n1 >= 0) {
      this.G[n1][n1] += conductance;
      if (n2 >= 0) this.G[n1][n2] -= conductance;
    }
    if (n2 >= 0) {
      this.G[n2][n2] += conductance;
      if (n1 >= 0) this.G[n2][n1] -= conductance;
    }
  }

  /**
   * Add Switch to MNA matrices
   * Acts as variable resistor based on state
   */
  private addSwitch(switchComp: Switch): void {
    const resistance = switchComp.getCircuitProperties().resistance || 1e12;
    const nodes = switchComp.getNodes();
    const componentId = switchComp.getName();

    const n1 = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
    const n2 = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;

    const conductance = 1 / resistance;

    if (n1 >= 0) {
      this.G[n1][n1] += conductance;
      if (n2 >= 0) this.G[n1][n2] -= conductance;
    }
    if (n2 >= 0) {
      this.G[n2][n2] += conductance;
      if (n1 >= 0) this.G[n2][n1] -= conductance;
    }
  }

  /**
   * Add Ammeter to MNA matrices
   * Acts as very low resistance
   */
  private addAmmeter(ammeter: Ammeter): void {
    const resistance = ammeter.getCircuitProperties().resistance || 0.001;
    const nodes = ammeter.getNodes();
    const componentId = ammeter.getName();

    const n1 = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
    const n2 = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;

    const conductance = 1 / resistance;

    if (n1 >= 0) {
      this.G[n1][n1] += conductance;
      if (n2 >= 0) this.G[n1][n2] -= conductance;
    }
    if (n2 >= 0) {
      this.G[n2][n2] += conductance;
      if (n1 >= 0) this.G[n2][n1] -= conductance;
    }
  }

  /**
   * Add high resistance component (Voltmeter/Oscilloscope)
   * Acts as very high resistance
   */
  private addHighResistance(component: CircuitComponent): void {
    const resistance = component.getCircuitProperties().resistance || 1e9;
    const nodes = component.getNodes();
    const componentId = component.getName();

    const n1 = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
    const n2 = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;

    const conductance = 1 / resistance;

    if (n1 >= 0) {
      this.G[n1][n1] += conductance;
      if (n2 >= 0) this.G[n1][n2] -= conductance;
    }
    if (n2 >= 0) {
      this.G[n2][n2] += conductance;
      if (n1 >= 0) this.G[n2][n1] -= conductance;
    }
  }

  /**
   * Add AC voltage source to MNA matrices
   * Similar to battery but voltage varies with time
   */
  private addACSource(source: ACSource, vsIndex: number): number {
    const voltage = source.getCircuitProperties().voltage; // Instantaneous voltage
    const nodes = source.getNodes();
    const componentId = source.getName();

    // Store voltage source index for this AC source
    this.voltageSourceMap.set(componentId, vsIndex);

    const n1 = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1; // Positive
    const n2 = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1; // Negative

    // Voltage source stamp (same as battery)
    if (n1 >= 0) {
      this.B[n1][vsIndex] = 1;
      this.C[vsIndex][n1] = 1;
    }
    if (n2 >= 0) {
      this.B[n2][vsIndex] = -1;
      this.C[vsIndex][n2] = -1;
    }

    this.e[vsIndex] = voltage;

    return vsIndex + 1;
  }

  /**
   * Add LED to circuit (educational model with realistic voltage drop)
   * Model: LED ≈ voltage source (Vf) in series with dynamic resistance (Rd)
   *
   * This model captures the key behavior of an LED:
   * - Forward voltage drop (Vf): ~1.8V for red, ~3.2V for blue
   * - Dynamic resistance (Rd): Small resistance when conducting (~25Ω)
   * - Total voltage: V_anode - V_cathode = Vf + I × Rd
   */
  private addLEDSimplified(led: LED, vsIndex: number): number {
    const nodes = led.getNodes();
    const componentId = led.getName();

    const n1 = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1; // Anode
    const n2 = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1; // Cathode

    // Check for reverse bias: if V_anode < V_cathode, model as very high resistance
    const vAnode = n1 >= 0 ? (nodes[0].voltage || 0) : 0;
    const vCathode = n2 >= 0 ? (nodes[1].voltage || 0) : 0;
    if (vAnode - vCathode < 0) {
      const reverseR = 1e9;
      const gReverse = 1 / reverseR;
      if (n1 >= 0) {
        this.G[n1][n1] += gReverse;
        if (n2 >= 0) this.G[n1][n2] -= gReverse;
      }
      if (n2 >= 0) {
        this.G[n2][n2] += gReverse;
        if (n1 >= 0) this.G[n2][n1] -= gReverse;
      }
      this.voltageSourceMap.set(componentId, vsIndex);
      return vsIndex + 1;
    }

    // Forward bias: model as voltage source (Vf) in series with dynamic resistance (Rd)
    const forwardVoltage = led.getForwardVoltage();
    const ledProps = led.getCircuitProperties() as any;
    const dynamicResistance = ledProps.dynamicResistance || 25;

    this.voltageSourceMap.set(componentId, vsIndex);

    if (n1 >= 0) {
      this.B[n1][vsIndex] = 1;
    }
    if (n2 >= 0) {
      this.B[n2][vsIndex] = -1;
    }

    if (n1 >= 0) {
      this.C[vsIndex][n1] = 1;
    }
    if (n2 >= 0) {
      this.C[vsIndex][n2] = -1;
    }

    this.D[vsIndex][vsIndex] = -dynamicResistance;
    this.e[vsIndex] = forwardVoltage;

    return vsIndex + 1;
  }

  /**
   * Add NPN BJT transistor (simplified model for educational purposes)
   * Model: Controlled resistor based on base-emitter voltage
   * - Cutoff (VBE < 0.7V): Very high resistance (open circuit)
   * - Active (VBE > 0.7V, VCE > 0.2V): IC = β × IB (current gain)
   * - Saturated (VBE > 0.7V, VCE < 0.2V): Low resistance (switch ON)
   */
  private addNPNTransistor(transistor: NPNTransistor): void {
    const nodes = transistor.getNodes();
    const componentId = transistor.getName();
    const props = transistor.getBJTProperties();

    // Node indices: 0=base, 1=collector, 2=emitter
    const nBase = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
    const nCollector = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;
    const nEmitter = this.nodeMap.get(`${componentId}_${nodes[2].id}`)! - 1;

    // Get node voltages (from previous iteration or initial)
    const vBase = nodes[0].voltage;
    const vEmitter = nodes[2].voltage;
    const vbe = vBase - vEmitter;

    // ALWAYS add pull-down resistor from base to emitter
    // This prevents floating base issues and ensures transistor turns off when switch opens
    // In real circuits, you'd ALWAYS use a physical pull-down resistor (e.g. 10kΩ - 100kΩ)
    // This is added BEFORE checking transistor state to ensure base can be pulled down
    const rPullDown = 100e3; // 100kΩ pull-down (strong enough to ensure stable OFF state, weak enough not to interfere when driven)
    const gPullDown = 1 / rPullDown;
    if (nBase >= 0) {
      this.G[nBase][nBase] += gPullDown;
      if (nEmitter >= 0) this.G[nBase][nEmitter] -= gPullDown;
    }
    if (nEmitter >= 0) {
      this.G[nEmitter][nEmitter] += gPullDown;
      if (nBase >= 0) this.G[nEmitter][nBase] -= gPullDown;
    }

    // Determine operating region based on VBE threshold
    if (vbe < props.vbe) {
      // Cutoff: transistor is OFF
      // Model base-emitter with LOW resistance to pull base to ground
      // Model collector-emitter with VERY HIGH resistance (open circuit)

      // Collector-Emitter: very high resistance (open circuit)
      const rCE_off = 1e15; // 1 PΩ
      const gCE_off = 1 / rCE_off;
      if (nCollector >= 0) {
        this.G[nCollector][nCollector] += gCE_off;
        if (nEmitter >= 0) this.G[nCollector][nEmitter] -= gCE_off;
      }
      if (nEmitter >= 0) {
        this.G[nEmitter][nEmitter] += gCE_off;
        if (nCollector >= 0) this.G[nEmitter][nCollector] -= gCE_off;
      }

      // Base-Emitter: Model as reverse-biased diode (extremely high resistance)
      // Use extremely high resistance to model open B-E junction when below threshold
      // This prevents voltage divider effects with base resistors
      // Real reverse-biased B-E junction: ~100 TΩ or more
      const rBE_off = 1e15; // 1 PΩ (reverse-biased diode, nearly open circuit)
      const gBE_off = 1 / rBE_off;
      if (nBase >= 0) {
        this.G[nBase][nBase] += gBE_off;
        if (nEmitter >= 0) this.G[nBase][nEmitter] -= gBE_off;
      }
      if (nEmitter >= 0) {
        this.G[nEmitter][nEmitter] += gBE_off;
        if (nBase >= 0) this.G[nEmitter][nBase] -= gBE_off;
      }
    } else {
      // Transistor is ON (active/saturated)
      // Base-Emitter junction: model as diode (forward biased)
      const rBE = 1000; // Base resistance ~1kΩ
      const gBE = 1 / rBE;

      if (nBase >= 0) {
        this.G[nBase][nBase] += gBE;
        if (nEmitter >= 0) this.G[nBase][nEmitter] -= gBE;
      }
      if (nEmitter >= 0) {
        this.G[nEmitter][nEmitter] += gBE;
        if (nBase >= 0) this.G[nEmitter][nBase] -= gBE;
      }

      // Collector-Emitter: model as low resistance when saturated
      // In saturation: VCE ≈ 0.2V, acts like a closed switch
      const rCE = 10; // 10Ω when saturated (acts as switch)
      const gCE = 1 / rCE;

      if (nCollector >= 0) {
        this.G[nCollector][nCollector] += gCE;
        if (nEmitter >= 0) this.G[nCollector][nEmitter] -= gCE;
      }
      if (nEmitter >= 0) {
        this.G[nEmitter][nEmitter] += gCE;
        if (nCollector >= 0) this.G[nEmitter][nCollector] -= gCE;
      }
    }
  }

  /**
   * Add PNP BJT transistor (simplified model for educational purposes)
   * Model: Controlled resistor based on emitter-base voltage
   * - Cutoff (VEB < 0.7V): Very high resistance (open circuit)
   * - Active (VEB > 0.7V, VEC > 0.2V): IC = β × IB (current flows E→C)
   * - Saturated (VEB > 0.7V, VEC < 0.2V): Low resistance (switch ON)
   */
  private addPNPTransistor(transistor: PNPTransistor): void {
    const nodes = transistor.getNodes();
    const componentId = transistor.getName();
    const props = transistor.getBJTProperties();

    // Node indices: 0=base, 1=collector, 2=emitter
    const nBase = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
    const nCollector = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;
    const nEmitter = this.nodeMap.get(`${componentId}_${nodes[2].id}`)! - 1;

    // Get node voltages (PNP is opposite polarity to NPN)
    const vBase = nodes[0].voltage;
    const vEmitter = nodes[2].voltage;
    const veb = vEmitter - vBase; // Note: VEB not VBE

    // ALWAYS add pull-up resistor from base to emitter
    // This prevents floating base issues and ensures transistor turns off when switch opens
    // In real circuits, you'd ALWAYS use a physical pull-up resistor (e.g. 10kΩ - 100kΩ)
    // This is added BEFORE checking transistor state to ensure base can be pulled up to emitter
    const rPullUp = 100e3; // 100kΩ pull-up (strong enough to ensure stable OFF state, weak enough not to interfere when driven)
    const gPullUp = 1 / rPullUp;
    if (nBase >= 0) {
      this.G[nBase][nBase] += gPullUp;
      if (nEmitter >= 0) this.G[nBase][nEmitter] -= gPullUp;
    }
    if (nEmitter >= 0) {
      this.G[nEmitter][nEmitter] += gPullUp;
      if (nBase >= 0) this.G[nEmitter][nBase] -= gPullUp;
    }

    // Determine operating region
    if (veb < props.vbe) {
      // Cutoff: transistor is OFF
      // Model emitter-collector with VERY HIGH resistance (open circuit)
      // Model emitter-base with LOW resistance to pull base to emitter

      // Emitter-Collector: very high resistance (open circuit, PNP conducts E→C)
      const rEC_off = 1e15; // 1 PΩ
      const gEC_off = 1 / rEC_off;
      if (nEmitter >= 0) {
        this.G[nEmitter][nEmitter] += gEC_off;
        if (nCollector >= 0) this.G[nEmitter][nCollector] -= gEC_off;
      }
      if (nCollector >= 0) {
        this.G[nCollector][nCollector] += gEC_off;
        if (nEmitter >= 0) this.G[nCollector][nEmitter] -= gEC_off;
      }

      // Emitter-Base: Model as reverse-biased diode (extremely high resistance)
      // Use extremely high resistance to model open E-B junction when below threshold
      // This prevents voltage divider effects with base resistors
      // Real reverse-biased E-B junction: ~100 TΩ or more
      const rEB_off = 1e15; // 1 PΩ (reverse-biased diode, nearly open circuit)
      const gEB_off = 1 / rEB_off;
      if (nEmitter >= 0) {
        this.G[nEmitter][nEmitter] += gEB_off;
        if (nBase >= 0) this.G[nEmitter][nBase] -= gEB_off;
      }
      if (nBase >= 0) {
        this.G[nBase][nBase] += gEB_off;
        if (nEmitter >= 0) this.G[nBase][nEmitter] -= gEB_off;
      }
    } else {
      // Transistor is ON
      // Emitter-Base junction: forward biased
      const rEB = 1000; // Base resistance ~1kΩ
      const gEB = 1 / rEB;

      if (nEmitter >= 0) {
        this.G[nEmitter][nEmitter] += gEB;
        if (nBase >= 0) this.G[nEmitter][nBase] -= gEB;
      }
      if (nBase >= 0) {
        this.G[nBase][nBase] += gEB;
        if (nEmitter >= 0) this.G[nBase][nEmitter] -= gEB;
      }

      // Emitter-Collector: low resistance when saturated
      const rEC = 10; // 10Ω when saturated
      const gEC = 1 / rEC;

      if (nEmitter >= 0) {
        this.G[nEmitter][nEmitter] += gEC;
        if (nCollector >= 0) this.G[nEmitter][nCollector] -= gEC;
      }
      if (nCollector >= 0) {
        this.G[nCollector][nCollector] += gEC;
        if (nEmitter >= 0) this.G[nCollector][nEmitter] -= gEC;
      }
    }
  }

  /**
   * Add capacitor for transient analysis
   * Use companion model: C_eq = C/Δt, I_eq = C/Δt * V_prev
   */
  private addCapacitorTransient(capacitor: Capacitor): void {
    const capacitance = capacitor.getCircuitProperties().value;
    const nodes = capacitor.getNodes();
    const componentId = capacitor.getName();

    const n1 = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
    const n2 = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;

    // Companion model: treat as conductance + current source
    const gEq = capacitance / this.timeStep;

    // Get previous voltage
    const prevState = this.previousState.get(componentId);
    const vPrev = prevState?.voltage || 0;
    const iEq = gEq * vPrev;

    // Add conductance
    if (n1 >= 0) {
      this.G[n1][n1] += gEq;
      if (n2 >= 0) this.G[n1][n2] -= gEq;
      this.i[n1] += iEq;
    }
    if (n2 >= 0) {
      this.G[n2][n2] += gEq;
      if (n1 >= 0) this.G[n2][n1] -= gEq;
      this.i[n2] -= iEq;
    }
  }

  /**
   * Add inductor for transient analysis
   * Use companion model: G_eq = Δt/L, V_eq = I_prev * Δt/L
   */
  private addInductorTransient(inductor: Inductor): void {
    const inductance = inductor.getCircuitProperties().value;
    const nodes = inductor.getNodes();
    const componentId = inductor.getName();

    const n1 = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
    const n2 = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;

    // Companion model
    const gEq = this.timeStep / inductance;

    // Get previous current
    const prevState = this.previousState.get(componentId);
    const iPrev = prevState?.current || 0;
    const vEq = iPrev * (this.timeStep / inductance);

    // Add conductance (Norton companion: G_eq in parallel with current source I_prev)
    if (n1 >= 0) {
      this.G[n1][n1] += gEq;
      if (n2 >= 0) this.G[n1][n2] -= gEq;
      this.i[n1] -= iPrev;
    }
    if (n2 >= 0) {
      this.G[n2][n2] += gEq;
      if (n1 >= 0) this.G[n2][n1] -= gEq;
      this.i[n2] += iPrev;
    }
  }

  /**
   * Solve MNA system using MathJS
   * Solves: [G B] [v]   [i]
   *         [C D] [j] = [e]
   */
  private solveMNA(): { nodeVoltages: number[]; sourceCurrents: number[] } {
    const n = this.G.length;
    const m = this.B[0]?.length || 0;

    if (n === 0) {
      return { nodeVoltages: [], sourceCurrents: [] };
    }

    // Build augmented matrix
    const A: number[][] = [];
    const z: number[] = [];

    // Top part: [G | B]
    for (let row = 0; row < n; row++) {
      A[row] = [...this.G[row], ...(m > 0 ? this.B[row] : [])];
      z[row] = this.i[row];
    }

    // Bottom part: [C | D]
    for (let row = 0; row < m; row++) {
      A[n + row] = [...this.C[row], ...this.D[row]];
      z[n + row] = this.e[row];
    }

    // Solve using MathJS
    try {
      const matrixA = matrix(A);
      const vectorZ = matrix(z);
      const solution = lusolve(matrixA, vectorZ) as Matrix;
      const x = solution.toArray() as number[][];

      return {
        nodeVoltages: x.slice(0, n).map((row) => row[0]),
        sourceCurrents: x.slice(n).map((row) => row[0]),
      };
    } catch (error) {
      console.error("Matrix solve error:", error);
      console.log("Matrix A:", A);
      console.log("Vector z:", z);
      throw error;
    }
  }

  /**
   * Update component states with solved voltages and currents
   */
  private updateComponentStates(solution: {
    nodeVoltages: number[];
    sourceCurrents: number[];
  }): void {
    this.components.forEach((component) => {
      const nodes = component.getNodes();
      if (nodes.length < 2) return;

      const componentId = component.getName();

      const n1 = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
      const n2 = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;

      const v1 = n1 >= 0 ? solution.nodeVoltages[n1] : 0;
      const v2 = n2 >= 0 ? solution.nodeVoltages[n2] : 0;
      const voltage = v1 - v2;

      // Calculate current based on component type
      let current = 0;
      const type = component.getComponentType();

      switch (type) {
        case "resistor":
          current = voltage / component.getCircuitProperties().value;
          break;
        case "capacitor":
          const prevCapVoltage =
            this.previousState.get(componentId)?.voltage || 0;
          const capacitance = (component as Capacitor).getCircuitProperties()
            .value;
          current = (capacitance * (voltage - prevCapVoltage)) / this.timeStep;
          break;
        case "inductor":
          const prevIndCurrent =
            this.previousState.get(componentId)?.current || 0;
          const inductance = (component as Inductor).getCircuitProperties()
            .value;
          current = prevIndCurrent + (voltage * this.timeStep) / inductance;
          break;
        case "led":
          // LED current comes from MNA solution (voltage source)
          const ledVsIndex = this.voltageSourceMap.get(componentId);
          if (ledVsIndex !== undefined) {
            current = solution.sourceCurrents[ledVsIndex];
          } else {
            console.warn(`LED ${componentId} voltage source index not found`);
            current = 0;
          }
          break;
        case "npn_transistor":
        case "pnp_transistor":
          // Transistor: current depends on operating region
          // Simplified: when ON, I = V / R (where R is 10Ω or 1kΩ depending on junction)
          const transProps =
            type === "npn_transistor"
              ? (component as NPNTransistor).getBJTProperties()
              : (component as PNPTransistor).getBJTProperties();
          const vbe =
            type === "npn_transistor"
              ? nodes[0].voltage - nodes[2].voltage
              : nodes[2].voltage - nodes[0].voltage;

          if (vbe > transProps.vbe) {
            // Transistor ON: collector current
            const vce = nodes[1].voltage - nodes[2].voltage;
            current = vce / 10; // Saturated: 10Ω
          } else {
            // Transistor OFF
            current = voltage / 1e12;
          }
          break;
        case "battery":
        case "acsource":
          // Current through voltage source comes from MNA solution
          // Use the voltage source map to get the correct index
          const vsIndex = this.voltageSourceMap.get(componentId);
          if (
            vsIndex !== undefined &&
            vsIndex < solution.sourceCurrents.length
          ) {
            current = solution.sourceCurrents[vsIndex];
          }
          break;
        case "switch":
        case "ammeter":
        case "voltmeter":
        case "oscilloscope":
          // Calculate current using Ohm's law (I = V/R)
          const resistance = component.getCircuitProperties().resistance;
          if (resistance && resistance > 0) {
            current = voltage / resistance;
          }
          break;
        case "ground":
          // Ground has no current
          current = 0;
          break;
      }

      // Update ALL component node voltages from the solution (including 3-terminal devices)
      for (let ni = 0; ni < nodes.length; ni++) {
        const idx =
          this.nodeMap.get(`${componentId}_${nodes[ni].id}`)! - 1;
        nodes[ni].voltage = idx >= 0 ? solution.nodeVoltages[idx] : 0;
      }

      // Update component state (voltage, current, power)
      component.updateCircuitState(voltage, current);
    });
  }

  /**
   * Store previous state for transient analysis
   */
  private storePreviousState(): void {
    this.components.forEach((component) => {
      const props = component.getCircuitProperties();
      this.previousState.set(component.getName(), {
        voltage: props.voltage,
        current: props.current,
      });
    });
  }

  /**
   * Count voltage sources in circuit
   */
  private countVoltageSources(): number {
    let count = 0;
    this.components.forEach((comp) => {
      const type = comp.getComponentType();
      // LEDs are modeled as voltage source (Vf) in series with resistance
      if (type === "battery" || type === "acsource" || type === "led") count++;
    });
    return count;
  }

  /**
   * Reset simulation
   */
  public reset(): void {
    this.currentTime = 0;
    this.previousState.clear();

    this.components.forEach((component) => {
      component.updateCircuitState(0, 0);
    });

    console.log("🔄 Enhanced solver reset");
  }

  /**
   * Get current simulation time
   */
  public getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * Round value for kid-friendly display
   * Rounds very small values to zero and limits decimal places
   */
  private roundForDisplay(value: number, threshold: number = 1e-6): number {
    // If value is extremely small (< threshold), round to zero
    if (Math.abs(value) < threshold) {
      return 0;
    }
    // Otherwise, round to 4 decimal places
    return Math.round(value * 10000) / 10000;
  }

  /**
   * Get circuit analysis results
   */
  public getAnalysisResults(): any {
    const nodeVoltages: { [key: string]: number } = {};

    this.nodeMap.forEach((_index, nodeId) => {
      if (nodeId !== "ground") {
        nodeVoltages[nodeId] = 0; // Would need to store from last solve
      }
    });

    return {
      time: this.roundForDisplay(this.currentTime),
      components: Array.from(this.components.entries()).map(([id, comp]) => {
        const props = comp.getCircuitProperties();
        return {
          id,
          type: comp.getComponentType(),
          voltage: this.roundForDisplay(props.voltage),
          current: this.roundForDisplay(props.current),
          power: this.roundForDisplay(props.power),
        };
      }),
      nodeCount: this.nodeMap.size - 1, // Exclude ground
      voltageSourceCount: this.voltageSourceCount,
    };
  }
}
