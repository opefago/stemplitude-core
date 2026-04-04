import { lusolve, matrix, Matrix } from "mathjs";
import { CircuitComponent } from "./CircuitComponent";
import { Resistor } from "./components/Resistor";
import { Capacitor } from "./components/Capacitor";
import { Battery } from "./components/Battery";
import { Inductor } from "./components/Inductor";
import { LED } from "./components/LED";
import { Switch } from "./components/Switch";
import { SpdtSwitch } from "./components/SpdtSwitch";
import { Potentiometer } from "./components/Potentiometer";
import { ZenerDiode } from "./components/ZenerDiode";
import { Ammeter } from "./components/Ammeter";
import { ACSource } from "./components/ACSource";
import { NPNTransistor } from "./components/NPNTransistor";
import { PNPTransistor } from "./components/PNPTransistor";
import type { SimulationSnapshot } from "./types/SimulationSnapshot";

// Keep warnings/errors, silence verbose dev logs for this module.
const console = {
  ...globalThis.console,
  log: (..._args: unknown[]) => {},
};

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
  private static readonly SOLVER_TUNING = {
    maxIterations: 24,
    // Trigger divergence only on meaningful growth to avoid over-reacting to noise.
    divergenceGrowthFactor: 1.2,
    divergenceRecoveryFactor: 0.9,
    backoffTriggerCount: 3,
    backoffScale: 0.6,
    recoveryScale: 1.35,
    minDtFloorScale: 1e-5,
    maxStateFlipsPerSubstep: 3,
  } as const;

  private components: Map<string, CircuitComponent>;
  private nodeMap: Map<string, number>; // Global node ID -> matrix index
  private nodeConnections: Map<string, Set<string>>; // Track which nodes are connected
  private voltageSourceCount: number = 0;
  private voltageSourceMap: Map<string, number>; // Component ID -> voltage source index
  private comparatorState: Map<string, boolean>;
  private relayState: Map<string, { drive: number; closed: boolean }>;
  private spdtState: Map<string, number>;
  private timer555State: Map<
    string,
    { latchSet: boolean; outputHigh: boolean; ctrlFiltered: number }
  >;

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

  // Store last solve results for snapshot export
  private lastSolveNodeVoltages: number[] = [];
  private lastSolveSourceCurrents: number[] = [];
  private inTransientStamping: boolean = false;
  private stateFlipCounts: Map<string, number> = new Map();
  private solverTelemetryEnabled: boolean = false;
  private solverTelemetryFrameCounter: number = 0;

  constructor() {
    this.components = new Map();
    this.nodeMap = new Map();
    this.nodeConnections = new Map();
    this.previousState = new Map();
    this.voltageSourceMap = new Map();
    this.comparatorState = new Map();
    this.relayState = new Map();
    this.spdtState = new Map();
    this.timer555State = new Map();

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
    this.comparatorState.delete(componentId);
    this.relayState.delete(componentId);
    this.spdtState.delete(componentId);
    this.timer555State.delete(componentId);
    this.stateFlipCounts.clear();

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
    const subSteps = this.recommendedSubsteps(deltaTime);
    const baseDt = deltaTime / subSteps;
    const minDt = Math.max(
      1e-7,
      deltaTime * EnhancedCircuitSolver.SOLVER_TUNING.minDtFloorScale
    );
    let adaptiveDt = baseDt;
    let remaining = deltaTime;
    let usedSubsteps = 0;
    let backoffs = 0;
    let convergedSubsteps = 0;
    let maxDivergence = 0;

    while (remaining > 1e-12) {
      const dt = Math.min(adaptiveDt, remaining);
      this.timeStep = dt;
      const result = this.simulateSingleTimeStep(dt);
      if (!result.ok) return false;
      usedSubsteps++;
      if (result.converged) convergedSubsteps++;
      maxDivergence = Math.max(maxDivergence, result.divergenceCount);

      this.currentTime += dt;
      remaining -= dt;

      // Back off time step after repeated divergence in a substep.
      if (
        !result.converged &&
        result.divergenceCount >= EnhancedCircuitSolver.SOLVER_TUNING.backoffTriggerCount
      ) {
        adaptiveDt = Math.max(
          minDt,
          dt * EnhancedCircuitSolver.SOLVER_TUNING.backoffScale
        );
        backoffs++;
      } else if (result.converged && result.divergenceCount === 0) {
        adaptiveDt = Math.min(
          baseDt,
          dt * EnhancedCircuitSolver.SOLVER_TUNING.recoveryScale
        );
      }
    }

    if (this.solverTelemetryEnabled) {
      this.solverTelemetryFrameCounter++;
      if (this.solverTelemetryFrameCounter % 60 === 0) {
        const convergencePct =
          usedSubsteps > 0 ? (100 * convergedSubsteps) / usedSubsteps : 100;
        console.debug(
          `[solver] t=${this.currentTime.toFixed(6)}s dtReq=${deltaTime.toExponential(2)} sub=${usedSubsteps}/${subSteps} conv=${convergencePct.toFixed(0)}% backoff=${backoffs} divMax=${maxDivergence}`
        );
      }
    }
    return true;
  }

  /** Dynamic substepping for sharp events (notably 555 edges). */
  private recommendedSubsteps(deltaTime: number): number {
    let minPeriod = Number.POSITIVE_INFINITY;
    let edgeUrgency = 0;
    this.components.forEach((component) => {
      if (component.getComponentType() !== "timer555") return;
      const props = component.getCircuitProperties() as {
        frequency?: number;
        mode?: string;
      };
      if (props.mode !== "astable") return;
      const f = props.frequency ?? 0;
      if (f > 0) {
        minPeriod = Math.min(minPeriod, 1 / f);
      }
      edgeUrgency = Math.max(edgeUrgency, this.estimate555EdgeUrgency(component));
    });
    if (!Number.isFinite(minPeriod)) return edgeUrgency > 0.8 ? 4 : 1;

    // Target at least ~48 points/period for stable threshold crossing behavior.
    const pointsPerPeriod = edgeUrgency > 0.9 ? 144 : edgeUrgency > 0.6 ? 96 : 48;
    const targetDt = minPeriod / pointsPerPeriod;
    const raw = Math.ceil(deltaTime / Math.max(targetDt, 1e-7));
    return Math.max(1, Math.min(raw, 64));
  }

  /**
   * Returns 0..1 urgency score for adding transient breakpoints/substeps.
   * High score when TRIG/THRESH/RESET are near their switching thresholds.
   */
  private estimate555EdgeUrgency(component: CircuitComponent): number {
    const nodes = component.getNodes();
    const byId = new Map(nodes.map((n) => [n.id, n.voltage]));
    const vGnd = byId.get("gnd") ?? 0;
    const vVcc = byId.get("vcc") ?? vGnd;
    const vTrig = byId.get("trig") ?? vGnd;
    const vThresh = byId.get("thresh") ?? vGnd;
    const vRst = byId.get("rst") ?? vVcc;
    const vCtrl = byId.get("ctrl") ?? vGnd;

    const vSupply = Math.max(0, vVcc - vGnd);
    if (vSupply < 1e-6) return 0;

    const state = this.timer555State.get(component.getName());
    const ctrlValid = Number.isFinite(vCtrl) && Math.abs(vCtrl - vGnd) > 0.05;
    const vUpperRaw = ctrlValid
      ? ((state?.ctrlFiltered ?? (vCtrl - vGnd)) as number)
      : (2 / 3) * vSupply;
    const vUpper = Math.min(Math.max(vUpperRaw, 0.2 * vSupply), 0.95 * vSupply);
    const vLower = 0.5 * vUpper;

    const dTrig = Math.abs(vTrig - vGnd - vLower);
    const dThresh = Math.abs(vThresh - vGnd - vUpper);
    const dReset = Math.abs(vRst - vGnd - 0.8);
    const norm = Math.max(0.01, 0.05 * vSupply); // ~5% Vcc window
    const d = Math.min(dTrig, dThresh, dReset);
    return Math.max(0, Math.min(1, 1 - d / norm));
  }

  private simulateSingleTimeStep(
    _dt: number
  ): { ok: boolean; converged: boolean; divergenceCount: number } {
    try {
      // Iterative Newton-Raphson for non-linear components (transistors, LEDs)
      // Similar to solveDC() but preserves previous time step state for reactive components
      const maxIterations = EnhancedCircuitSolver.SOLVER_TUNING.maxIterations;
      const convergenceTolerance = 0.01; // 10mV tolerance (tight enough to ensure stability)
      const minChangeThreshold = 0.001; // 1mV minimum change to consider (ignore tiny fluctuations)
      let converged = false;
      let prevMaxChange = Number.POSITIVE_INFINITY;
      let divergenceCount = 0;
      this.stateFlipCounts.clear();

      // Reset node voltages to previous stable state before iteration
      // This prevents oscillations from building up
      const stableVoltages = new Map<string, number>();
      this.components.forEach((component) => {
        component.getNodes().forEach((node) => {
          const nodeId = `${component.getName()}_${node.id}`;
          stableVoltages.set(nodeId, node.voltage);
        });
      });
      let bestVoltages = new Map(stableVoltages);
      let bestMaxChange = Number.POSITIVE_INFINITY;

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

        // Compute raw Newton step size before damping.
        let rawMaxChange = 0;
        this.components.forEach((component) => {
          component.getNodes().forEach((node) => {
            const nodeId = `${component.getName()}_${node.id}`;
            const oldVoltage = previousVoltages.get(nodeId) || 0;
            rawMaxChange = Math.max(rawMaxChange, Math.abs(node.voltage - oldVoltage));
          });
        });

        // Adaptive damping:
        // - Large steps => stronger damping.
        // - Repeated divergence => stronger damping.
        // - Near convergence => lighter damping for faster finish.
        const baseBlend =
          rawMaxChange > 1 ? 0.2 : rawMaxChange > 0.25 ? 0.35 : rawMaxChange > 0.05 ? 0.5 : 0.7;
        const dampingFactor = Math.max(
          0.15,
          Math.min(0.9, baseBlend - divergenceCount * 0.1)
        );
        this.components.forEach((component) => {
          component.getNodes().forEach((node) => {
            const nodeId = `${component.getName()}_${node.id}`;
            const oldVoltage = previousVoltages.get(nodeId) || 0;
            const newVoltage = node.voltage;
            node.voltage =
              dampingFactor * newVoltage + (1 - dampingFactor) * oldVoltage;
          });
        });

        // Check for convergence
        let maxChange = 0;
        this.components.forEach((component) => {
          component.getNodes().forEach((node) => {
            const nodeId = `${component.getName()}_${node.id}`;
            const prevVoltage = previousVoltages.get(nodeId) || 0;
            const change = Math.abs(node.voltage - prevVoltage);

            // Only count significant changes (ignore tiny numerical noise)
            if (change > minChangeThreshold) {
              maxChange = Math.max(maxChange, change);
            }
          });
        });

        if (maxChange < bestMaxChange) {
          bestMaxChange = maxChange;
          bestVoltages = new Map<string, number>();
          this.components.forEach((component) => {
            component.getNodes().forEach((node) => {
              const nodeId = `${component.getName()}_${node.id}`;
              bestVoltages.set(nodeId, node.voltage);
            });
          });
        }

        if (
          maxChange >
          prevMaxChange * EnhancedCircuitSolver.SOLVER_TUNING.divergenceGrowthFactor
        ) {
          divergenceCount++;
        } else if (
          maxChange <
          prevMaxChange * EnhancedCircuitSolver.SOLVER_TUNING.divergenceRecoveryFactor
        ) {
          divergenceCount = 0;
        }
        prevMaxChange = Math.max(maxChange, 1e-12);

        // Check for convergence.
        if (maxChange < convergenceTolerance) {
          converged = true;
          break;
        }
      }

      if (!converged) {
        // Fall back to best iterate found this step instead of hard reset.
        this.components.forEach((component) => {
          component.getNodes().forEach((node) => {
            const nodeId = `${component.getName()}_${node.id}`;
            node.voltage = bestVoltages.get(nodeId) ?? stableVoltages.get(nodeId) ?? 0;
          });
        });
      }

      // Reconcile component states with the final damped/fallback node voltages.
      // Without this, reactive history (especially C/L previousState) can lag one
      // iteration behind and drift from the voltages we actually retained.
      try {
        this.buildTransientMatrices();
        const reconciledSolution = this.solveMNA();
        this.updateComponentStates(reconciledSolution);
      } catch {
        // Keep last successful iterate if reconciliation fails.
      }

      this.storePreviousState();
      return { ok: true, converged, divergenceCount };
    } catch (error) {
      console.error("❌ Transient simulation failed:", error);
      return { ok: false, converged: false, divergenceCount: 99 };
    }
  }

  private limitStateFlip(key: string, prev: boolean, next: boolean): boolean {
    if (prev === next) return next;
    const flips = this.stateFlipCounts.get(key) ?? 0;
    const maxFlipsPerSubstep =
      EnhancedCircuitSolver.SOLVER_TUNING.maxStateFlipsPerSubstep;
    if (flips >= maxFlipsPerSubstep) return prev;
    this.stateFlipCounts.set(key, flips + 1);
    return next;
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

    // SPICE-style gmin: weak shunt to ground for each node to improve conditioning
    // and avoid pathological floating-node singularities.
    const gmin = 1e-12;
    for (let ni = 0; ni < numNodes; ni++) {
      this.G[ni][ni] += gmin;
    }

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
          // DC analysis only: inductor becomes its winding resistance.
          if (!this.inTransientStamping) {
            this.addInductorDC(component as Inductor);
          }
          break;
        case "led":
          // LED: nonlinear PN junction companion model.
          this.addLEDSimplified(component as LED);
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
        case "push_button":
          // Switch: acts as variable resistor (low when closed, high when open)
          this.addSwitch(component as Switch);
          break;
        case "spdt_switch":
          this.addSpdtSwitch(component as SpdtSwitch);
          break;
        case "potentiometer":
          this.addPotentiometer(component as Potentiometer);
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
        case "diode":
          // Diode: nonlinear PN junction companion model.
          this.addLEDSimplified(component as any);
          break;
        case "zener_diode":
          // Zener: forward PN + reverse breakdown companion model.
          this.addZenerSimplified(component as ZenerDiode);
          break;
        case "nmos_transistor":
          // NMOS: piecewise linear like BJT — model as switch/variable resistor
          this.addMOSFETSwitch(component);
          break;
        case "pmos_transistor":
          // PMOS: same treatment as NMOS
          this.addMOSFETSwitch(component);
          break;
        case "opamp":
          // Op-amp: behavioral VCVS with finite output impedance and saturation.
          vsIndex = this.addOpAmp(component, vsIndex);
          break;
        case "comparator":
          // Comparator: threshold+hysteresis with finite output impedance.
          vsIndex = this.addComparator(component, vsIndex);
          break;
        case "timer555":
          // 555: solver-integrated behavioral macro model (comparators+latch+discharge+OUT stage)
          vsIndex = this.addTimer555(component, vsIndex);
          break;
        case "relay":
          // Relay coil as resistor; contacts handled separately
          this.addRelayCoil(component);
          break;
        case "nor_gate":
        case "nand_gate":
        case "and_gate":
        case "or_gate":
        case "xor_gate":
        case "not_gate":
          // Logic gates: behavioral digital outputs with finite output impedance.
          vsIndex = this.addLogicGate(component, type, vsIndex);
          break;
        case "ground":
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
    this.inTransientStamping = true;
    try {
      this.buildMNAMatrices();
    } finally {
      this.inTransientStamping = false;
    }

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
   * SPST switch / push button: `isClosed` must drive the MNA stamp — the
   * `resistance` field can drift from UI state (property edits, undo, load).
   */
  private static readonly SPST_R_ON = 1e-3;
  private static readonly SPST_R_OFF = 1e15;

  private resolveSpstResistanceOhms(component: CircuitComponent): number {
    const p = component.getCircuitProperties() as {
      isClosed?: boolean;
      resistance?: number;
    };
    if (typeof p.isClosed === "boolean") {
      return p.isClosed
        ? EnhancedCircuitSolver.SPST_R_ON
        : EnhancedCircuitSolver.SPST_R_OFF;
    }
    const r = p.resistance;
    if (r != null && Number.isFinite(r) && r > 0) {
      return r;
    }
    return EnhancedCircuitSolver.SPST_R_OFF;
  }

  /**
   * Add inductor for DC analysis (short circuit)
   */
  private addInductorDC(inductor: Inductor): void {
    // In DC steady state, inductor behaves as winding resistance (DCR).
    const nodes = inductor.getNodes();
    const componentId = inductor.getName();
    const props = inductor.getCircuitProperties() as any;

    const n1 = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
    const n2 = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;
    const dcr = Math.max(props.dcResistance ?? 0.1, 1e-5);
    this.addTwoNodeConductance(n1, n2, 1 / dcr);
  }

  /**
   * Add Switch to MNA matrices
   * Acts as variable resistor based on state
   */
  private addSwitch(switchComp: Switch): void {
    const resistance = this.resolveSpstResistanceOhms(switchComp);
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

  /** SPDT: common to one throw low-R, other throw open */
  private addSpdtSwitch(c: SpdtSwitch): void {
    const props = c.getCircuitProperties() as { connectUpper?: boolean };
    const connectUpper = props.connectUpper ?? true;
    const nodes = c.getNodes();
    const componentId = c.getName();
    const rOn = 0.02;
    const rOff = 1e9;
    const nc = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
    const na = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;
    const nb = this.nodeMap.get(`${componentId}_${nodes[2].id}`)! - 1;
    const prev = this.spdtState.get(componentId) ?? (connectUpper ? 1 : 0);
    const prevMode = prev >= 0.5;
    const limitedMode = this.limitStateFlip(
      `spdt:${componentId}`,
      prevMode,
      connectUpper
    );
    const target = limitedMode ? 1 : 0;
    const tau = 2e-4; // 0.2 ms travel smoothing
    const alpha = Math.min(1, this.timeStep / (this.timeStep + tau));
    const wiper = prev + alpha * (target - prev);
    this.spdtState.set(componentId, wiper);

    // Break-before-make blend: keep both contacts weak near midpoint.
    const upperClosure = wiper > 0.55 ? 1 : wiper < 0.45 ? 0 : (wiper - 0.45) / 0.1;
    const lowerClosure =
      wiper < 0.45 ? 1 : wiper > 0.55 ? 0 : (0.55 - wiper) / 0.1;
    const gOn = 1 / rOn;
    const gOff = 1 / rOff;
    const gA = gOff + (gOn - gOff) * upperClosure;
    const gB = gOff + (gOn - gOff) * lowerClosure;
    this.addTwoNodeConductance(nc, na, gA);
    this.addTwoNodeConductance(nc, nb, gB);
  }

  /** Potentiometer: two resistors end1–wiper and wiper–end2 */
  private addPotentiometer(c: Potentiometer): void {
    const props = c.getCircuitProperties() as {
      totalResistance?: number;
      value?: number;
      wiperPosition?: number;
    };
    const R = props.totalResistance ?? props.value ?? 10000;
    const alpha = props.wiperPosition ?? 0.5;
    const R1 = Math.max(R * alpha, 1e-9);
    const R2 = Math.max(R * (1 - alpha), 1e-9);
    const g1 = 1 / R1;
    const g2 = 1 / R2;
    const nodes = c.getNodes();
    const componentId = c.getName();
    const n1 = this.nodeMap.get(`${componentId}_end1`)! - 1;
    const nw = this.nodeMap.get(`${componentId}_wiper`)! - 1;
    const n2 = this.nodeMap.get(`${componentId}_end2`)! - 1;

    if (n1 >= 0) {
      this.G[n1][n1] += g1;
      if (nw >= 0) this.G[n1][nw] -= g1;
    }
    if (nw >= 0) {
      this.G[nw][nw] += g1 + g2;
      if (n1 >= 0) this.G[nw][n1] -= g1;
      if (n2 >= 0) this.G[nw][n2] -= g2;
    }
    if (n2 >= 0) {
      this.G[n2][n2] += g2;
      if (nw >= 0) this.G[n2][nw] -= g2;
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

  private addTwoNodeConductance(
    n1: number,
    n2: number,
    conductance: number
  ): void {
    if (conductance <= 0 || !Number.isFinite(conductance)) return;
    if (n1 >= 0) {
      this.G[n1][n1] += conductance;
      if (n2 >= 0) this.G[n1][n2] -= conductance;
    }
    if (n2 >= 0) {
      this.G[n2][n2] += conductance;
      if (n1 >= 0) this.G[n2][n1] -= conductance;
    }
  }

  // Positive current flows from nPlus to nMinus.
  private addTwoNodeCurrentSource(nPlus: number, nMinus: number, current: number): void {
    if (!Number.isFinite(current) || current === 0) return;
    if (nPlus >= 0) this.i[nPlus] -= current;
    if (nMinus >= 0) this.i[nMinus] += current;
  }

  private evaluatePnCompanion(
    vAnodeCathode: number,
    kneeVoltage: number,
    dynamicResistance: number
  ): { g: number; i: number } {
    // Smooth piecewise-linear knee model:
    // below knee: tiny leakage; above knee: ~linear with dynamicResistance.
    const rDyn = Math.max(dynamicResistance, 1e-3);
    const gLin = 1 / rDyn;
    const smoothV = 0.03; // ~30mV smoothing window
    const x = Math.max(-60, Math.min(60, (vAnodeCathode - kneeVoltage) / smoothV));
    const sigmoid = 1 / (1 + Math.exp(-x));
    const softplus = smoothV * Math.log1p(Math.exp(x)); // ≈ max(v-knee, 0)
    const iLeak = 1e-12 * vAnodeCathode;
    const i = gLin * softplus + iLeak;
    const g = Math.min(50, Math.max(1e-12, gLin * sigmoid + 1e-12));
    return { g, i };
  }

  private addSeriesVoltageSource(
    nPlus: number,
    nMinus: number,
    vsIndex: number,
    voltage: number,
    seriesResistance: number
  ): void {
    if (nPlus >= 0) {
      this.B[nPlus][vsIndex] = 1;
      this.C[vsIndex][nPlus] = 1;
    }
    if (nMinus >= 0) {
      this.B[nMinus][vsIndex] = -1;
      this.C[vsIndex][nMinus] = -1;
    }
    // V(n+) - V(n-) - R*I = Vtarget
    this.D[vsIndex][vsIndex] = -Math.max(seriesResistance, 1e-9);
    this.e[vsIndex] = voltage;
  }

  /**
   * Behavioral NE555-like stamp:
   * - internal SR latch driven by TRIG/THRESH comparators
   * - DIS pin transistor to GND when output low
   * - OUT pin modeled as Thevenin source to GND with finite Rout
   */
  private addTimer555(component: CircuitComponent, vsIndex: number): number {
    const componentId = component.getName();
    const nodes = component.getNodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const nodeIndex = (id: string) =>
      (this.nodeMap.get(`${componentId}_${id}`) ?? 0) - 1;

    const nOut = nodeIndex("out");
    const nGnd = nodeIndex("gnd");
    const nDis = nodeIndex("disch");

    const vGnd = byId.get("gnd")?.voltage ?? 0;
    const vVcc = byId.get("vcc")?.voltage ?? vGnd;
    const vTrig = byId.get("trig")?.voltage ?? vGnd;
    const vThresh = byId.get("thresh")?.voltage ?? vGnd;
    const vCtrlRaw = byId.get("ctrl")?.voltage ?? vGnd;
    const vRst = byId.get("rst")?.voltage ?? vVcc;

    const vSupply = Math.max(0, vVcc - vGnd);
    const resetLow = vRst - vGnd < 0.8;
    const enabled = !resetLow && vSupply >= 4.0;
    const ctrlValid = Number.isFinite(vCtrlRaw) && Math.abs(vCtrlRaw - vGnd) > 0.05;
    const trigRel = vTrig - vGnd;
    const threshRel = vThresh - vGnd;

    const prev = this.timer555State.get(componentId) ?? {
      latchSet: false,
      outputHigh: false,
      ctrlFiltered: (2 / 3) * vSupply,
    };
    const ctrlAlpha = Math.min(1, this.timeStep / (this.timeStep + 2e-6));
    const ctrlInstant = ctrlValid ? vCtrlRaw - vGnd : (2 / 3) * vSupply;
    const ctrlFiltered =
      prev.ctrlFiltered + ctrlAlpha * (ctrlInstant - prev.ctrlFiltered);
    const vUpperRaw = ctrlValid ? ctrlFiltered : (2 / 3) * vSupply;
    const vUpper = Math.min(Math.max(vUpperRaw, 0.2 * vSupply), 0.95 * vSupply);
    const vLower = 0.5 * vUpper;
    const hyst = Math.max(0.003, 0.002 * vSupply);
    let latchSet = prev.latchSet;
    if (!enabled) {
      latchSet = false;
    } else {
      if (trigRel < vLower - hyst) latchSet = true;
      if (threshRel > vUpper + hyst) latchSet = false;
    }
    latchSet = this.limitStateFlip(`timer555:${componentId}`, prev.latchSet, latchSet);
    const outputHigh = enabled && latchSet;
    this.timer555State.set(componentId, { latchSet, outputHigh, ctrlFiltered });

    const dischR = outputHigh ? 1e9 : 12;
    this.addTwoNodeConductance(nDis, nGnd, 1 / dischR);

    const outTarget = outputHigh ? Math.max(0, vSupply - 1.2) : 0.15;
    const outR = outputHigh ? 25 : 18;
    this.voltageSourceMap.set(componentId, vsIndex);
    this.addSeriesVoltageSource(nOut, nGnd, vsIndex, outTarget, outR);

    // Keep component behavior/UI synchronized with solver-integrated state.
    component.updateCircuitProperties({ outputHigh } as any);
    return vsIndex + 1;
  }

  private addOpAmp(component: CircuitComponent, vsIndex: number): number {
    const componentId = component.getName();
    const props = component.getCircuitProperties() as any;
    const nodes = component.getNodes();
    const inv = nodes.find((n) => n.id === "inverting");
    const nonInv = nodes.find((n) => n.id === "nonInverting");
    const out = nodes.find((n) => n.id === "output");
    if (!inv || !nonInv || !out) return vsIndex;

    const nInv = (this.nodeMap.get(`${componentId}_${inv.id}`) ?? 0) - 1;
    const nNonInv = (this.nodeMap.get(`${componentId}_${nonInv.id}`) ?? 0) - 1;
    const nOut = (this.nodeMap.get(`${componentId}_${out.id}`) ?? 0) - 1;
    const nGnd = -1;

    // Input bias paths (very high Zin to ground) to avoid ideal floating inputs.
    const zin = Math.max(props.inputImpedance ?? 1e6, 1e3);
    this.addTwoNodeConductance(nInv, nGnd, 1 / zin);
    this.addTwoNodeConductance(nNonInv, nGnd, 1 / zin);

    const vDiff = (nonInv.voltage ?? 0) - (inv.voltage ?? 0);
    const av = Math.max(props.openLoopGain ?? 100000, 1);
    const vSatP = props.vSatPositive ?? 12;
    const vSatN = props.vSatNegative ?? -12;
    const vTargetRaw = av * vDiff;
    const vTarget = Math.max(vSatN, Math.min(vSatP, vTargetRaw));
    const rout = Math.max(props.outputImpedance ?? 75, 1e-3);

    this.voltageSourceMap.set(componentId, vsIndex);
    this.addSeriesVoltageSource(nOut, nGnd, vsIndex, vTarget, rout);
    return vsIndex + 1;
  }

  private addComparator(component: CircuitComponent, vsIndex: number): number {
    const componentId = component.getName();
    const props = component.getCircuitProperties() as any;
    const nodes = component.getNodes();
    const inv = nodes.find((n) => n.id === "inverting");
    const nonInv = nodes.find((n) => n.id === "nonInverting");
    const out = nodes.find((n) => n.id === "output");
    if (!inv || !nonInv || !out) return vsIndex;

    const nInv = (this.nodeMap.get(`${componentId}_${inv.id}`) ?? 0) - 1;
    const nNonInv = (this.nodeMap.get(`${componentId}_${nonInv.id}`) ?? 0) - 1;
    const nOut = (this.nodeMap.get(`${componentId}_${out.id}`) ?? 0) - 1;
    const nGnd = -1;

    const zin = 1e6;
    this.addTwoNodeConductance(nInv, nGnd, 1 / zin);
    this.addTwoNodeConductance(nNonInv, nGnd, 1 / zin);

    const threshold = props.threshold ?? 0;
    const hysteresis = Math.max(props.hysteresis ?? 0.1, 0);
    const vDiff = (nonInv.voltage ?? 0) - (inv.voltage ?? 0);
    const prevHigh = this.comparatorState.get(componentId) ?? !!props.isOutputHigh;
    let isHigh = prevHigh;
    if (prevHigh) {
      if (vDiff < threshold - hysteresis) isHigh = false;
    } else {
      if (vDiff > threshold + hysteresis) isHigh = true;
    }
    isHigh = this.limitStateFlip(`comparator:${componentId}`, prevHigh, isHigh);
    this.comparatorState.set(componentId, isHigh);
    component.updateCircuitProperties({ isOutputHigh: isHigh } as any);

    const vHigh = props.outputHigh ?? 5;
    const vLow = props.outputLow ?? 0;
    const vTarget = isHigh ? vHigh : vLow;
    const rout = 40;

    this.voltageSourceMap.set(componentId, vsIndex);
    this.addSeriesVoltageSource(nOut, nGnd, vsIndex, vTarget, rout);
    return vsIndex + 1;
  }

  private addLogicGate(
    component: CircuitComponent,
    gateType: string,
    vsIndex: number
  ): number {
    const componentId = component.getName();
    const nodes = component.getNodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const nGnd = -1;
    const logicThreshold = 2.5;
    const vHigh = 5;
    const vLow = 0;
    const rout = 35;
    const zin = 1e7;

    const boolFromNode = (nodeId: string): boolean =>
      ((byId.get(nodeId)?.voltage ?? 0) >= logicThreshold);

    // Input leakage paths for conditioning.
    ["inputA", "inputB", "input1", "input2", "input"].forEach((id) => {
      const idx = (this.nodeMap.get(`${componentId}_${id}`) ?? 0) - 1;
      if (idx >= 0) this.addTwoNodeConductance(idx, nGnd, 1 / zin);
    });

    let outHigh = false;
    if (gateType === "not_gate") {
      const a = boolFromNode("input");
      outHigh = !a;
      component.updateCircuitProperties({ input: a, output: outHigh } as any);
    } else if (gateType === "and_gate") {
      const a = boolFromNode("inputA");
      const b = boolFromNode("inputB");
      outHigh = a && b;
      component.updateCircuitProperties({ inputA: a, inputB: b, output: outHigh } as any);
    } else if (gateType === "or_gate") {
      const a = boolFromNode("inputA");
      const b = boolFromNode("inputB");
      outHigh = a || b;
      component.updateCircuitProperties({ inputA: a, inputB: b, output: outHigh } as any);
    } else if (gateType === "xor_gate") {
      const a = boolFromNode("inputA");
      const b = boolFromNode("inputB");
      outHigh = a !== b;
      component.updateCircuitProperties({ inputA: a, inputB: b, output: outHigh } as any);
    } else if (gateType === "nand_gate") {
      const a = boolFromNode("input1");
      const b = boolFromNode("input2");
      outHigh = !(a && b);
      component.updateCircuitProperties({
        inputStates: [a, b],
        outputState: outHigh,
      } as any);
    } else if (gateType === "nor_gate") {
      const a = boolFromNode("input1");
      const b = boolFromNode("input2");
      outHigh = !(a || b);
      component.updateCircuitProperties({
        inputStates: [a, b],
        outputState: outHigh,
      } as any);
    }

    const outNode =
      gateType === "not_gate"
        ? "output"
        : "output";
    const nOut = (this.nodeMap.get(`${componentId}_${outNode}`) ?? 0) - 1;
    if (nOut < 0) return vsIndex;

    this.voltageSourceMap.set(componentId, vsIndex);
    this.addSeriesVoltageSource(nOut, nGnd, vsIndex, outHigh ? vHigh : vLow, rout);
    return vsIndex + 1;
  }

  /**
   * Add MOSFET as a smooth voltage-controlled channel conductance.
   * This avoids hard switching artifacts while keeping the model lightweight.
   */
  private addMOSFETSwitch(component: CircuitComponent): void {
    const props = component.getCircuitProperties() as any;
    const nodes = component.getNodes();
    const componentId = component.getName();

    const gateNode = nodes.find((n: any) => n.id === "gate");
    const drainNode = nodes.find((n: any) => n.id === "drain");
    const sourceNode = nodes.find((n: any) => n.id === "source");
    if (!drainNode || !sourceNode) return;

    const gateV = gateNode ? gateNode.voltage : 0;
    const drainV = drainNode.voltage;
    const sourceV = sourceNode.voltage;
    const rdson = Math.max(props.rdson ?? 0.1, 1e-5);
    const vth = Math.abs(props.vgsThreshold ?? 2);
    const isNmos = component.getComponentType() === "nmos_transistor";
    const overdrive = isNmos ? gateV - sourceV - vth : sourceV - gateV - vth;

    // Smooth turn-on around Vth (logistic blend) to reduce numerical chatter.
    const sharpness = 0.06;
    const sigmoid = 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, overdrive / sharpness))));
    const gOff = 1e-9;
    const gOn = 1 / rdson;
    const conductance = gOff + (gOn - gOff) * sigmoid;

    const n1 = (this.nodeMap.get(`${componentId}_${drainNode.id}`) ?? 0) - 1;
    const n2 = (this.nodeMap.get(`${componentId}_${sourceNode.id}`) ?? 0) - 1;

    this.addTwoNodeConductance(n1, n2, conductance);
  }

  /**
   * Add relay coil as a simple resistor between coil terminals.
   */
  private addRelayCoil(component: CircuitComponent): void {
    const props = component.getCircuitProperties() as any;
    const nodes = component.getNodes();
    const componentId = component.getName();

    const coil1 = nodes.find((n: any) => n.id === "coil1");
    const coil2 = nodes.find((n: any) => n.id === "coil2");
    if (!coil1 || !coil2) return;

    const resistance = Math.max(props.coilResistance ?? 100, 1e-3);
    const conductance = 1 / resistance;

    const n1 = (this.nodeMap.get(`${componentId}_${coil1.id}`) ?? 0) - 1;
    const n2 = (this.nodeMap.get(`${componentId}_${coil2.id}`) ?? 0) - 1;

    this.addTwoNodeConductance(n1, n2, conductance);

    // Coil-derived actuation with pickup/dropout hysteresis and finite release.
    const vCoil = Math.abs((coil1.voltage ?? 0) - (coil2.voltage ?? 0));
    const vAct = Math.max(0.1, props.activationVoltage ?? 5);
    const pickup = vAct;
    const dropout = 0.7 * vAct;
    const prev = this.relayState.get(componentId) ?? { drive: 0, closed: false };
    let closed = prev.closed;
    if (!closed && vCoil >= pickup) closed = true;
    if (closed && vCoil <= dropout) closed = false;
    closed = this.limitStateFlip(`relay:${componentId}`, prev.closed, closed);
    const targetDrive = closed ? 1 : 0;
    const tauPull = 1.2e-3;
    const tauRelease = 2.5e-3;
    const tau = targetDrive > prev.drive ? tauPull : tauRelease;
    const alpha = Math.min(1, this.timeStep / (this.timeStep + tau));
    const drive = prev.drive + alpha * (targetDrive - prev.drive);
    this.relayState.set(componentId, { drive, closed });
    component.updateCircuitProperties({ isActivated: drive > 0.5 } as any);

    // Contact side: finite on/off resistance blended by relay armature drive.
    const contactCommon = nodes.find((n: any) => n.id === "contact_common");
    const contactNo = nodes.find((n: any) => n.id === "contact_no");
    if (contactCommon && contactNo) {
      const ron = 0.03;
      const roff = 1e9;
      const gOn = 1 / ron;
      const gOff = 1 / roff;
      const contactG = gOff + (gOn - gOff) * drive;
      const nc = (this.nodeMap.get(`${componentId}_${contactCommon.id}`) ?? 0) - 1;
      const nn = (this.nodeMap.get(`${componentId}_${contactNo.id}`) ?? 0) - 1;
      this.addTwoNodeConductance(nc, nn, contactG);
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
  private addLEDSimplified(led: LED): void {
    const nodes = led.getNodes();
    const componentId = led.getName();
    const nAnode = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
    const nCathode = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;
    const vAnode = nodes[0].voltage || 0;
    const vCathode = nodes[1].voltage || 0;
    const vak = vAnode - vCathode;
    const forwardVoltage = led.getForwardVoltage();
    const ledProps = led.getCircuitProperties() as any;
    const dynamicResistance = ledProps.dynamicResistance ?? 25;

    const { g, i } = this.evaluatePnCompanion(vak, forwardVoltage, dynamicResistance);
    const iEq = i - g * vak;
    this.addTwoNodeConductance(nAnode, nCathode, g);
    this.addTwoNodeCurrentSource(nAnode, nCathode, iEq);
  }

  /**
   * Add Zener diode with piecewise model:
   * - Forward bias: Vf + dynamic resistance (like diode)
   * - Reverse below breakdown: high resistance leakage
   * - Reverse at/above breakdown: -Vz + dynamic resistance
   */
  private addZenerSimplified(zener: ZenerDiode): void {
    const nodes = zener.getNodes();
    const componentId = zener.getName();
    const props = zener.getCircuitProperties() as any;

    const nAnode = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
    const nCathode = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;

    const vAnode = nAnode >= 0 ? (nodes[0].voltage || 0) : 0;
    const vCathode = nCathode >= 0 ? (nodes[1].voltage || 0) : 0;
    const vForward = vAnode - vCathode;
    const vReverse = vCathode - vAnode;

    const forwardVoltage = zener.getForwardVoltage();
    const breakdownVoltage = zener.getBreakdownVoltage();
    const dynamicResistance = props.dynamicResistance || 10;

    const fwd = this.evaluatePnCompanion(vForward, forwardVoltage, dynamicResistance);

    let totalG = fwd.g;
    let totalI = fwd.i; // positive is anode -> cathode

    // Reverse breakdown branch: current flows cathode -> anode.
    if (vReverse > breakdownVoltage) {
      const rev = this.evaluatePnCompanion(
        vReverse,
        breakdownVoltage,
        dynamicResistance
      );
      totalG += rev.g;
      totalI -= rev.i;
    }

    const iEq = totalI - totalG * vForward;
    this.addTwoNodeConductance(nAnode, nCathode, totalG);
    this.addTwoNodeCurrentSource(nAnode, nCathode, iEq);
  }

  /**
   * Add NPN BJT transistor (simplified model for educational purposes)
   * Model: Controlled resistor based on base-emitter voltage
   * - Cutoff (VBE < 0.7V): Very high resistance (open circuit)
   * - Active (VBE > 0.7V, VCE > 0.2V): IC = β × IB (current gain)
   * - Saturated (VBE > 0.7V, VCE < 0.2V): Low resistance (switch ON)
   */
  private addNPNTransistor(transistor: NPNTransistor): void {
    this.addBjtStamp(transistor, false);
  }

  /**
   * Add PNP BJT transistor (simplified model for educational purposes)
   * Model: Controlled resistor based on emitter-base voltage
   * - Cutoff (VEB < 0.7V): Very high resistance (open circuit)
   * - Active (VEB > 0.7V, VEC > 0.2V): IC = β × IB (current flows E→C)
   * - Saturated (VEB > 0.7V, VEC < 0.2V): Low resistance (switch ON)
   */
  private addPNPTransistor(transistor: PNPTransistor): void {
    this.addBjtStamp(transistor, true);
  }

  private addBjtStamp(
    transistor: NPNTransistor | PNPTransistor,
    isPnp: boolean
  ): void {
    const nodes = transistor.getNodes();
    const componentId = transistor.getName();
    const props = transistor.getBJTProperties();

    // Node indices: 0=base, 1=collector, 2=emitter
    const nBase = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
    const nCollector = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;
    const nEmitter = this.nodeMap.get(`${componentId}_${nodes[2].id}`)! - 1;

    const vBase = nodes[0].voltage;
    const vCollector = nodes[1].voltage;
    const vEmitter = nodes[2].voltage;

    // Robust BJT educational model:
    // - base-emitter controlled conduction ("drive")
    // - collector-emitter path as controlled resistor for deterministic switching
    // This is intentionally stable for interactive circuits (less fragile than pure gm stamps).
    const vbeEff = isPnp ? vEmitter - vBase : vBase - vEmitter;
    const vceEff = isPnp ? vEmitter - vCollector : vCollector - vEmitter;
    const sharpness = 0.03;
    const drive =
      1 /
      (1 +
        Math.exp(
          -Math.max(-60, Math.min(60, (vbeEff - (props.vbe ?? 0.7)) / sharpness))
        ));

    const gBeOff = 1e-9;
    const gCeOff = 1e-9;
    const gBeOn = 1 / 1200; // input junction when driven
    const gCeOn = 1 / 8; // saturated-ish C-E path for switch behavior
    const gBe = gBeOff + (gBeOn - gBeOff) * drive;
    const gCe = gCeOff + (gCeOn - gCeOff) * drive;

    this.addTwoNodeConductance(nBase, nEmitter, gBe);
    this.addTwoNodeConductance(nCollector, nEmitter, gCe);

    // Convention across components: positive terminal current = enters component from wire.
    const ib = gBe * (vBase - vEmitter);
    const ic = gCe * (vCollector - vEmitter);
    const ie = -(ib + ic); // KCL

    // Keep component visual region flags coherent with operating point hints.
    const on = drive > 0.5;
    const saturated = isPnp
      ? vceEff < (props.vcesat ?? 0.2)
      : vceEff < (props.vcesat ?? 0.2);
    transistor.updateCircuitProperties({
      isCutoff: !on,
      isActive: on && !saturated,
      isSaturated: on && saturated,
      baseCurrent: ib,
      collectorCurrent: ic,
      emitterCurrent: ie,
    } as any);
  }

  /**
   * Add capacitor for transient analysis
   * Use companion model: C_eq = C/Δt, I_eq = C/Δt * V_prev
   */
  private addCapacitorTransient(capacitor: Capacitor): void {
    const props = capacitor.getCircuitProperties() as any;
    const capacitance = Math.max(props.value ?? 0, 1e-15);
    const esr = Math.max(props.esr ?? 0, 0);
    const leakageResistance = Math.max(props.leakageResistance ?? 1e9, 1e3);
    const nodes = capacitor.getNodes();
    const componentId = capacitor.getName();

    const n1 = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
    const n2 = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;

    // Backward-Euler companion with optional ESR folded into effective branch conductance.
    const gIdeal = capacitance / this.timeStep;
    const gEq = gIdeal / (1 + esr * gIdeal);

    // Get previous voltage
    const prevState = this.previousState.get(componentId);
    const vPrev = prevState?.voltage || 0;
    const iEq = gEq * vPrev;
    this.addTwoNodeConductance(n1, n2, gEq);
    this.addTwoNodeCurrentSource(n1, n2, -iEq);

    // Dielectric leakage (parallel resistance).
    this.addTwoNodeConductance(n1, n2, 1 / leakageResistance);
  }

  /**
   * Add inductor for transient analysis
   * Use companion model: G_eq = Δt/L, V_eq = I_prev * Δt/L
   */
  private addInductorTransient(inductor: Inductor): void {
    const props = inductor.getCircuitProperties() as any;
    const inductance = Math.max(props.value ?? 0, 1e-12);
    const dcr = Math.max(props.dcResistance ?? 0.1, 0);
    const nodes = inductor.getNodes();
    const componentId = inductor.getName();

    const n1 = this.nodeMap.get(`${componentId}_${nodes[0].id}`)! - 1;
    const n2 = this.nodeMap.get(`${componentId}_${nodes[1].id}`)! - 1;

    // Backward-Euler inductor companion with series DCR damping.
    const alpha = this.timeStep / inductance;
    const denom = 1 + alpha * dcr;
    const gEq = alpha / denom;

    // Get previous current
    const prevState = this.previousState.get(componentId);
    const iPrev = prevState?.current || 0;
    const iHist = iPrev / denom;

    // Norton companion: i = gEq * v + iHist (from n1 -> n2).
    this.addTwoNodeConductance(n1, n2, gEq);
    this.addTwoNodeCurrentSource(n1, n2, iHist);
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

      const nodeVoltages = x.slice(0, n).map((row) => row[0]);
      const sourceCurrents = x.slice(n).map((row) => row[0]);

      this.lastSolveNodeVoltages = nodeVoltages;
      this.lastSolveSourceCurrents = sourceCurrents;

      return { nodeVoltages, sourceCurrents };
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
          {
            const prevCapVoltage =
              this.previousState.get(componentId)?.voltage || 0;
            const capProps = (component as Capacitor).getCircuitProperties() as any;
            const capacitance = Math.max(capProps.value ?? 0, 1e-15);
            const esr = Math.max(capProps.esr ?? 0, 0);
            const leakageResistance = Math.max(
              capProps.leakageResistance ?? 1e9,
              1e3
            );
            const gIdeal = capacitance / this.timeStep;
            const gEq = gIdeal / (1 + esr * gIdeal);
            const iDyn = gEq * (voltage - prevCapVoltage);
            const iLeak = voltage / leakageResistance;
            current = iDyn + iLeak;
          }
          break;
        case "inductor":
          {
            const prevIndCurrent =
              this.previousState.get(componentId)?.current || 0;
            const indProps = (component as Inductor).getCircuitProperties() as any;
            const inductance = Math.max(indProps.value ?? 0, 1e-12);
            const dcr = Math.max(indProps.dcResistance ?? 0.1, 0);
            const alpha = this.timeStep / inductance;
            const denom = 1 + alpha * dcr;
            current = (prevIndCurrent + alpha * voltage) / denom;
          }
          break;
        case "led":
        case "diode":
        case "zener_diode":
          {
            const props = component.getCircuitProperties() as any;
            const vAk = voltage;
            const rdyn = Math.max(props.dynamicResistance ?? 10, 1e-3);
            const vf = Math.abs(props.forwardVoltage ?? 0.7);
            const fwd = this.evaluatePnCompanion(vAk, vf, rdyn);
            current = fwd.i;

            if (type === "zener_diode") {
              const vz = Math.abs(props.breakdownVoltage ?? 5.1);
              const vKa = -vAk;
              if (vKa > vz) {
                const rev = this.evaluatePnCompanion(vKa, vz, rdyn);
                current -= rev.i;
              }
            }
          }
          break;
        case "npn_transistor":
        case "pnp_transistor":
          // Recompute BJT terminal currents from solved node voltages (this step),
          // then publish them for snapshot/export and branch flow logic.
          {
            const transProps =
              type === "npn_transistor"
                ? (component as NPNTransistor).getBJTProperties()
                : (component as PNPTransistor).getBJTProperties();
            const isPnp = type === "pnp_transistor";
            const vBase = nodes[0]?.voltage ?? 0;
            const vCollector = nodes[1]?.voltage ?? 0;
            const vEmitter = nodes[2]?.voltage ?? 0;
            const vbeEff = isPnp ? vEmitter - vBase : vBase - vEmitter;
            const vceEff = isPnp ? vEmitter - vCollector : vCollector - vEmitter;
            const sharpness = 0.03;
            const drive =
              1 /
              (1 +
                Math.exp(
                  -Math.max(
                    -60,
                    Math.min(60, (vbeEff - (transProps.vbe ?? 0.7)) / sharpness)
                  )
                ));

            const gBe = 1e-9 + (1 / 1200 - 1e-9) * drive;
            const gCe = 1e-9 + (1 / 8 - 1e-9) * drive;
            const ib = gBe * (vBase - vEmitter);
            const ic = gCe * (vCollector - vEmitter);
            const ie = -(ib + ic);
            const on = drive > 0.5;
            const saturated = vceEff < (transProps.vcesat ?? 0.2);

            component.updateCircuitProperties({
              isCutoff: !on,
              isActive: on && !saturated,
              isSaturated: on && saturated,
              baseCurrent: ib,
              collectorCurrent: ic,
              emitterCurrent: ie,
            } as any);

            current = ic;
          }
          break;
        case "nmos_transistor":
        case "pmos_transistor":
          {
            const gate = nodes.find((n) => n.id === "gate");
            const drain = nodes.find((n) => n.id === "drain");
            const source = nodes.find((n) => n.id === "source");
            const props = component.getCircuitProperties() as any;
            if (gate && drain && source) {
              const gateV = gate.voltage;
              const drainV = drain.voltage;
              const sourceV = source.voltage;
              const vth = Math.abs(props.vgsThreshold ?? 2);
              const rdson = Math.max(props.rdson ?? 0.1, 1e-5);
              const overdrive =
                type === "nmos_transistor"
                  ? gateV - sourceV - vth
                  : sourceV - gateV - vth;
              const sharpness = 0.06;
              const sigmoid =
                1 /
                (1 + Math.exp(-Math.max(-60, Math.min(60, overdrive / sharpness))));
              const gOff = 1e-9;
              const gOn = 1 / rdson;
              const gds = gOff + (gOn - gOff) * sigmoid;
              current = (drainV - sourceV) * gds;
              const on = sigmoid > 0.5;
              component.updateCircuitProperties({ isConducting: on } as any);
            }
          }
          break;
        case "battery":
        case "acsource":
        case "opamp":
        case "comparator":
        case "timer555":
        case "nor_gate":
        case "nand_gate":
        case "and_gate":
        case "or_gate":
        case "xor_gate":
        case "not_gate":
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
        case "push_button":
          {
            const rSpst = this.resolveSpstResistanceOhms(component);
            if (rSpst > 0 && Number.isFinite(rSpst)) {
              current = voltage / rSpst;
            }
          }
          break;
        case "ammeter":
        case "voltmeter":
        case "oscilloscope":
          // Calculate current using Ohm's law (I = V/R)
          {
            const resistance = component.getCircuitProperties().resistance;
            if (resistance && resistance > 0) {
              current = voltage / resistance;
            }
          }
          break;
        case "spdt_switch":
          {
            const props = component.getCircuitProperties() as any;
            const nCommon = nodes.find((n) => n.id === "common");
            const nA = nodes.find((n) => n.id === "throw_a");
            const nB = nodes.find((n) => n.id === "throw_b");
            if (nCommon && nA && nB) {
              const connectUpper = props.connectUpper ?? true;
              const target = connectUpper ? 1 : 0;
              const wiper = this.spdtState.get(componentId) ?? target;
              const upperClosure =
                wiper > 0.55 ? 1 : wiper < 0.45 ? 0 : (wiper - 0.45) / 0.1;
              const lowerClosure =
                wiper < 0.45 ? 1 : wiper > 0.55 ? 0 : (0.55 - wiper) / 0.1;
              const gOn = 1 / 0.02;
              const gOff = 1e-9;
              const gA = gOff + (gOn - gOff) * upperClosure;
              const gB = gOff + (gOn - gOff) * lowerClosure;
              current =
                gA * (nCommon.voltage - nA.voltage) +
                gB * (nCommon.voltage - nB.voltage);
            }
          }
          break;
        case "relay":
          {
            const props = component.getCircuitProperties() as any;
            const coil1 = nodes.find((n) => n.id === "coil1");
            const coil2 = nodes.find((n) => n.id === "coil2");
            if (coil1 && coil2) {
              const rCoil = Math.max(props.coilResistance ?? 100, 1e-3);
              current = (coil1.voltage - coil2.voltage) / rCoil;
            }
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
      // Components modeled with explicit MNA voltage sources.
      if (
        type === "battery" ||
        type === "acsource" ||
        type === "opamp" ||
        type === "comparator" ||
        type === "timer555" ||
        type === "nor_gate" ||
        type === "nand_gate" ||
        type === "and_gate" ||
        type === "or_gate" ||
        type === "xor_gate" ||
        type === "not_gate"
      ) {
        count++;
      }
    });
    return count;
  }

  /**
   * Reset simulation
   */
  public reset(): void {
    this.currentTime = 0;
    this.previousState.clear();
    this.comparatorState.clear();
    this.relayState.clear();
    this.spdtState.clear();
    this.timer555State.clear();
    this.stateFlipCounts.clear();

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

  public setSolverTelemetryEnabled(enabled: boolean): void {
    this.solverTelemetryEnabled = enabled;
    this.solverTelemetryFrameCounter = 0;
  }

  public isSolverTelemetryEnabled(): boolean {
    return this.solverTelemetryEnabled;
  }

  /**
   * True if two pins of a component share the same post-union electrical node
   * (e.g. 555 TRIG/THR/DIS tied per classic astable).
   */
  public areNodesElectricallyCommon(
    componentId: string,
    nodeIdA: string,
    nodeIdB: string
  ): boolean {
    const a = `${componentId}_${nodeIdA}`;
    const b = `${componentId}_${nodeIdB}`;
    const ia = this.nodeMap.get(a);
    const ib = this.nodeMap.get(b);
    if (ia === undefined || ib === undefined) return false;
    return ia === ib;
  }

  /** Merged net index after union-find (same index ⇒ same electrical node). Ground group is 0. */
  public getMergedNodeIndex(
    componentId: string,
    nodeId: string
  ): number | undefined {
    return this.nodeMap.get(`${componentId}_${nodeId}`);
  }

  /** For discrete R/C discovery (e.g. 555 astable passives). */
  public getCircuitComponents(): ReadonlyMap<string, CircuitComponent> {
    return this.components;
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
   * Get circuit analysis results (legacy interface, kept for compatibility)
   */
  public getAnalysisResults(): any {
    const nodeVoltages: { [key: string]: number } = {};

    this.nodeMap.forEach((index, nodeId) => {
      if (nodeId !== "ground") {
        const solverIndex = index - 1;
        nodeVoltages[nodeId] =
          solverIndex >= 0 && solverIndex < this.lastSolveNodeVoltages.length
            ? this.lastSolveNodeVoltages[solverIndex]
            : 0;
      }
    });

    return {
      time: this.roundForDisplay(this.currentTime),
      nodeVoltages,
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
      nodeCount: this.nodeMap.size - 1,
      voltageSourceCount: this.voltageSourceCount,
    };
  }

  /**
   * Get typed simulation snapshot with per-node voltages and per-terminal data.
   */
  public getSimulationSnapshot(): SimulationSnapshot {
    const nodeVoltages: Record<string, number> = {};
    this.nodeMap.forEach((index, nodeId) => {
      if (nodeId === "ground") {
        nodeVoltages[nodeId] = 0;
      } else {
        const solverIndex = index - 1;
        nodeVoltages[nodeId] =
          solverIndex >= 0 && solverIndex < this.lastSolveNodeVoltages.length
            ? this.lastSolveNodeVoltages[solverIndex]
            : 0;
      }
    });

    const componentTerminalCurrents: Record<string, Record<string, number>> = {};
    const componentTerminalVoltages: Record<string, Record<string, number>> = {};
    const componentPower: Record<string, number> = {};

    this.components.forEach((component, componentId) => {
      const props = component.getCircuitProperties();
      const nodes = component.getNodes();

      componentPower[componentId] = Math.abs(props.voltage * props.current);

      const terminalVoltages: Record<string, number> = {};
      const terminalCurrents: Record<string, number> = {};

      const isVoltageSource = this.voltageSourceMap.has(componentId);
      for (let ni = 0; ni < nodes.length; ni++) {
        const node = nodes[ni];
        const globalNodeId = `${componentId}_${node.id}`;
        const idx = this.nodeMap.get(globalNodeId);
        if (idx !== undefined) {
          const solverIdx = idx - 1;
          terminalVoltages[node.id] =
            solverIdx >= 0 && solverIdx < this.lastSolveNodeVoltages.length
              ? this.lastSolveNodeVoltages[solverIdx]
              : 0;
        } else {
          terminalVoltages[node.id] = 0;
        }

        if (Math.abs(node.current) > 1e-12) {
          terminalCurrents[node.id] = node.current;
        } else if (nodes.length === 2) {
          // Convention: positive = enters terminal from wire.
          // Passive: current enters nodes[0] when props.current > 0.
          // Voltage source: current exits nodes[0] when j_vs > 0 → negate.
          const sign = isVoltageSource
            ? (ni === 0 ? -1 : 1)
            : (ni === 0 ? 1 : -1);
          terminalCurrents[node.id] = sign * props.current;
        } else {
          terminalCurrents[node.id] = 0;
        }
      }

      componentTerminalVoltages[componentId] = terminalVoltages;
      componentTerminalCurrents[componentId] = terminalCurrents;
    });

    return {
      time: this.currentTime,
      nodeVoltages,
      componentTerminalCurrents,
      componentTerminalVoltages,
      componentPower,
    };
  }
}
