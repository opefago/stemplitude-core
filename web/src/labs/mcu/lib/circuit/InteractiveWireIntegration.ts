/**
 * Interactive Wire Integration
 *
 * Integrates the InteractiveWireSystem with CircuitScene
 * to provide seamless wire editing capabilities
 */

import { CircuitScene } from "./CircuitScene";
import {
  InteractiveWireSystem,
  InteractiveWireConnection,
  WireNode,
} from "./InteractiveWireSystem";
import { CircuitComponent } from "./CircuitComponent";
import { GridCanvas } from "./GridCanvas";
import { emitLabEventThrottled } from "../../../../lib/api/gamification";
import { orderedComponentEndpointsForWire } from "./wireEndpointTopology";

// Keep warnings/errors, silence verbose dev logs for this module.
const console = {
  ...globalThis.console,
  log: (..._args: unknown[]) => {},
};

export interface WireEditMode {
  enabled: boolean;
  selectedWire: string | null;
  dragPoint: { x: number; y: number } | null;
  snapThreshold: number;
}

export interface WireEditOptions {
  enableDragToRoute: boolean;
  enableWireJoining: boolean;
  enableSmartDeletion: boolean;
  showJunctionNodes: boolean;
  snapToGrid: boolean;
  snapThreshold: number;
}

type EndpointFlowDirection = "startToEnd" | "endToStart" | "unknown";

/**
 * Integration layer for interactive wire editing
 */
export class InteractiveWireIntegration {
  private circuitScene: CircuitScene;
  private wireSystem: InteractiveWireSystem;
  private gridCanvas: GridCanvas;

  private editMode: WireEditMode;
  private options: WireEditOptions;
  private static readonly CURRENT_EPS = 1e-9;
  private static readonly VOLTAGE_EPS = 1e-5;
  private static readonly FLIP_HOLD_CURRENT_A = 2e-4;

  constructor(circuitScene: CircuitScene, gridCanvas: GridCanvas) {
    this.circuitScene = circuitScene;
    this.gridCanvas = gridCanvas;
    this.wireSystem = new InteractiveWireSystem(gridCanvas, {
      onTopologyChanged: () => {
        this.circuitScene.syncInteractiveWireGraphToSolver();
      },
    });

    this.editMode = {
      enabled: true, // Enable by default
      selectedWire: null,
      dragPoint: null,
      snapThreshold: 15,
    };

    this.options = {
      enableDragToRoute: true,
      enableWireJoining: true,
      enableSmartDeletion: true,
      showJunctionNodes: true,
      snapToGrid: true,
      snapThreshold: 15,
    };

    this.setupIntegration();
  }

  /**
   * Setup integration with CircuitScene
   */
  private setupIntegration(): void {
    // Add wire system container to zoomable container (same as regular wire system)
    this.circuitScene.zoomableContainer.addChild(
      this.wireSystem.getContainer()
    );

    // Override circuit scene wire methods
    this.overrideWireMethods();

    // Setup keyboard shortcuts
    this.setupKeyboardShortcuts();

  }

  /**
   * Override CircuitScene wire methods
   */
  private overrideWireMethods(): void {
    // Override createWire method
    (this.circuitScene as any).createWire = (
      wireId: string,
      startComp: string,
      startNode: string,
      endComp: string,
      endNode: string
    ) => {
      return this.createWire(wireId, startComp, startNode, endComp, endNode);
    };

    // Override removeWire method
    (this.circuitScene as any).removeWire = (wireId: string) => {
      return this.removeWire(wireId);
    };

    // Override updateWireStates method
    (this.circuitScene as any).updateWireStates = (results: any) => {
      this.updateWireStates(results);
    };
  }

  /**
   * Setup keyboard shortcuts for wire editing
   */
  private setupKeyboardShortcuts(): void {
    document.addEventListener("keydown", (event) => {
      if (!this.editMode.enabled) return;

      switch (event.key) {
        case "Escape":
          this.cancelWireEdit();
          break;
        case "Delete":
        case "Backspace":
          if (this.editMode.selectedWire) {
            this.deleteSelectedWire();
          }
          break;
        case "j":
          if (event.ctrlKey) {
            this.toggleJunctionNodes();
          }
          break;
        case "r":
          if (event.ctrlKey) {
            this.rerouteSelectedWire();
          }
          break;
      }
    });
  }

  /**
   * Create a wire with interactive capabilities
   */
  private getCircuitComponent(componentName: string): CircuitComponent | null {
    const obj = this.circuitScene.getGameObject(componentName);
    return obj instanceof CircuitComponent ? obj : null;
  }

  private buildConnectionContext(
    wireId: string,
    startComponent: string,
    startNode: string,
    endComponent: string,
    endNode: string
  ): Record<string, unknown> {
    const fromComp = this.getCircuitComponent(startComponent);
    const toComp = this.getCircuitComponent(endComponent);

    const fromType = fromComp?.getComponentType() ?? "unknown";
    const toType = toComp?.getComponentType() ?? "unknown";
    const fromGrid = fromComp?.getGridPosition();
    const toGrid = toComp?.getGridPosition();

    const connectedComponents = [
      {
        role: "from",
        id: startComponent,
        type: fromType,
        node: startNode,
        grid: fromGrid ?? null,
      },
      {
        role: "to",
        id: endComponent,
        type: toType,
        node: endNode,
        grid: toGrid ?? null,
      },
    ];

    return {
      wire_id: wireId,
      connection_kind: "component_to_component",
      from_component: startComponent,
      from_component_type: fromType,
      from_node: startNode,
      to_component: endComponent,
      to_component_type: toType,
      to_node: endNode,
      component_ids: [startComponent, endComponent],
      component_types: [fromType, toType],
      connected_components: connectedComponents,
      connected_component_count: connectedComponents.length,
      connection_signature: `${fromType}:${startNode}->${toType}:${endNode}`,
      wire_count: this.wireSystem.getWires().size,
    };
  }

  public createWire(
    wireId: string,
    startComponent: string,
    startNode: string,
    endComponent: string,
    endNode: string
  ): boolean {
    const success = this.wireSystem.createWire(
      wireId,
      startComponent,
      startNode,
      endComponent,
      endNode
    );

    if (success) {
      emitLabEventThrottled({
        lab_id: "circuit-maker",
        lab_type: "circuit-maker",
        event_type: "OBJECT_CONNECTED",
        context: this.buildConnectionContext(
          wireId,
          startComponent,
          startNode,
          endComponent,
          endNode
        ),
      }, 600);

      // Get routing statistics
    }

    return success;
  }

  /**
   * Remove a wire
   */
  public removeWire(wireId: string): boolean {
    const success = this.wireSystem.removeWire(wireId);

    if (success) {
    }

    return success;
  }

  /**
   * Update wire states with analysis results
   */
  public updateWireStates(results: any): void {
    const componentCurrents: Record<string, Record<string, number>> =
      results?.componentTerminalCurrents ?? {};
    const componentVoltages: Record<string, Record<string, number>> =
      results?.componentTerminalVoltages ?? {};
    const components: Array<{ id: string; current: number }> =
      results?.components ?? [];

    this.wireSystem.getWires().forEach((wire, wireId) => {
      const { first: startEndpoint, second: endEndpoint } =
        orderedComponentEndpointsForWire(wire);
      const nonComponentNode = wire.nodes.find((n) => n.type !== "component");
      const startCompId = startEndpoint?.componentId;
      const startNodeId = startEndpoint?.nodeId;
      const endCompId = endEndpoint?.componentId;
      const endNodeId = endEndpoint?.nodeId;

      // Get current magnitude from exact endpoint terminal currents only.
      // Avoid falling back to whole-component current, which can misreport branch wires.
      const startMag =
        startCompId && startNodeId
          ? Math.abs(componentCurrents[startCompId]?.[startNodeId] ?? 0)
          : 0;
      const endMag =
        endCompId && endNodeId
          ? Math.abs(componentCurrents[endCompId]?.[endNodeId] ?? 0)
          : 0;
      let currentMagnitude = 0;
      if (startMag > 1e-12 && endMag > 1e-12) {
        // Use average of both terminals for robustness to tiny solve noise.
        currentMagnitude = 0.5 * (startMag + endMag);
      } else {
        currentMagnitude = Math.max(startMag, endMag);
      }

      const eps = InteractiveWireIntegration.CURRENT_EPS;
      if (currentMagnitude < eps) {
        wire.current = 0;
        wire.voltage = componentVoltages[startCompId ?? ""]?.[startNodeId ?? ""] ?? 0;
        (wire as any).flowDirEndpoint = "unknown";
        (wire as any).flowDirSign = 0;
        (wire as any).flowConfidence = 0;
        (wire as any).flowSource = null;
        (wire as any).flowSink = null;
        return;
      }

      // Determine direction from endpoint terminal-current directions.
      // +1 = current exits terminal into wire, -1 = current enters terminal from wire.
      // Wire sign convention: +1 means start->end, -1 means end->start.
      const prevSign = Math.abs(wire.current) > eps ? (wire.current >= 0 ? 1 : -1) : 0;
      const prevFlow = (wire as any).flowDirEndpoint as EndpointFlowDirection | undefined;
      let sign = prevSign !== 0 ? prevSign : 1;
      let flowDir: EndpointFlowDirection = "unknown";
      let flowConfidence = 0;
      let sourceEndpoint: any | null = null;
      let sinkEndpoint: any | null = null;
      const startDir = this.getExternalCurrentDirection(
        startCompId, startNodeId, componentCurrents, componentVoltages
      );
      const endDir = this.getExternalCurrentDirection(
        endCompId, endNodeId, componentCurrents, componentVoltages
      );

      const startV =
        startCompId && startNodeId
          ? componentVoltages[startCompId]?.[startNodeId]
          : undefined;
      const endV =
        endCompId && endNodeId ? componentVoltages[endCompId]?.[endNodeId] : undefined;

      // SPICE/MNA-style direction:
      // use solved terminal branch-current signs as the primary source of truth.
      // Convention in solver snapshot:
      //   terminal current > 0 => current enters component from wire
      // Therefore, wire start->end signed current candidates are:
      //   -startTerminalCurrent (at start endpoint), +endTerminalCurrent (at end endpoint).
      const signedCurrentCandidates: number[] = [];
      const startTermCurrent =
        startCompId && startNodeId
          ? componentCurrents[startCompId]?.[startNodeId]
          : undefined;
      const endTermCurrent =
        endCompId && endNodeId ? componentCurrents[endCompId]?.[endNodeId] : undefined;
      if (Number.isFinite(startTermCurrent) && Math.abs(startTermCurrent as number) > eps) {
        signedCurrentCandidates.push(-(startTermCurrent as number));
      }
      if (Number.isFinite(endTermCurrent) && Math.abs(endTermCurrent as number) > eps) {
        signedCurrentCandidates.push(endTermCurrent as number);
      }
      if (signedCurrentCandidates.length > 0) {
        const signedAverage =
          signedCurrentCandidates.reduce((sum, value) => sum + value, 0) /
          signedCurrentCandidates.length;
        const averageMagnitude =
          signedCurrentCandidates.reduce((sum, value) => sum + Math.abs(value), 0) /
          signedCurrentCandidates.length;

        let sign = signedAverage >= 0 ? 1 : -1;
        const prevFlow = (wire as any).flowDirEndpoint as EndpointFlowDirection | undefined;
        if (
          Math.abs(signedAverage) < eps &&
          (prevFlow === "startToEnd" || prevFlow === "endToStart")
        ) {
          sign = prevFlow === "startToEnd" ? 1 : -1;
        }

        const flowDir: EndpointFlowDirection = sign > 0 ? "startToEnd" : "endToStart";
        const sourceEndpoint =
          sign > 0
            ? startEndpoint ?? nonComponentNode ?? null
            : endEndpoint ?? nonComponentNode ?? null;
        const sinkEndpoint =
          sign > 0
            ? endEndpoint ?? nonComponentNode ?? null
            : startEndpoint ?? nonComponentNode ?? null;

        wire.current = sign * Math.max(averageMagnitude, currentMagnitude);
        wire.voltage =
          componentVoltages[startCompId ?? ""]?.[startNodeId ?? ""] ?? 0;
        (wire as any).flowDirEndpoint = flowDir;
        (wire as any).flowDirSign = sign;
        (wire as any).flowConfidence =
          signedCurrentCandidates.length === 2 ? 3 : 2;
        (wire as any).flowSource = sourceEndpoint
          ? {
              componentId: sourceEndpoint.componentId,
              nodeId: sourceEndpoint.nodeId,
              x: sourceEndpoint.x,
              y: sourceEndpoint.y,
            }
          : null;
        (wire as any).flowSink = sinkEndpoint
          ? {
              componentId: sinkEndpoint.componentId,
              nodeId: sinkEndpoint.nodeId,
              x: sinkEndpoint.x,
              y: sinkEndpoint.y,
            }
          : null;
        (wire as any).startDir = startDir;
        (wire as any).endDir = endDir;
        return;
      }

      if (startDir !== 0 && endDir !== 0) {
        // Ideal physically consistent pair:
        // start exits (+1), end enters (-1) => start->end
        if (startDir === 1 && endDir === -1) {
          sign = 1;
          flowDir = "startToEnd";
          flowConfidence = 3;
          sourceEndpoint = startEndpoint;
          sinkEndpoint = endEndpoint;
          // end exits (+1), start enters (-1) => end->start
        } else if (startDir === -1 && endDir === 1) {
          sign = -1;
          flowDir = "endToStart";
          flowConfidence = 3;
          sourceEndpoint = endEndpoint;
          sinkEndpoint = startEndpoint;
        } else {
          // Conflicting pair (both enter or both exit): prefer deterministic endpoint rules
          // over tiny current-magnitude differences (common around ground nodes).
          const startI = Math.abs(
            (startCompId && startNodeId && componentCurrents[startCompId]?.[startNodeId]) ?? 0
          );
          const endI = Math.abs(
            (endCompId && endNodeId && componentCurrents[endCompId]?.[endNodeId]) ?? 0
          );
          const startIsGround = startNodeId === "ground";
          const endIsGround = endNodeId === "ground";

          if (startIsGround !== endIsGround) {
            // Prefer the non-ground endpoint as direction authority.
            sign = startIsGround ? -endDir : startDir;
            flowDir = sign > 0 ? "startToEnd" : "endToStart";
            flowConfidence = 2;
            if (sign > 0) {
              sourceEndpoint = startEndpoint;
              sinkEndpoint = endEndpoint;
            } else {
              sourceEndpoint = endEndpoint;
              sinkEndpoint = startEndpoint;
            }
          } else if (prevSign !== 0) {
            // Preserve previous direction when available to avoid chatter.
            sign = prevSign;
            flowDir = sign > 0 ? "startToEnd" : "endToStart";
            flowConfidence = 1;
            if (sign > 0) {
              sourceEndpoint = startEndpoint;
              sinkEndpoint = endEndpoint;
            } else {
              sourceEndpoint = endEndpoint;
              sinkEndpoint = startEndpoint;
            }
          } else {
            // Last resort: stronger endpoint only when meaningfully different.
            const imbalance = Math.abs(startI - endI);
            if (imbalance > 5 * eps) {
              sign = startI >= endI ? startDir : -endDir;
              flowDir = sign > 0 ? "startToEnd" : "endToStart";
              flowConfidence = 1;
              if (sign > 0) {
                sourceEndpoint = startEndpoint;
                sinkEndpoint = endEndpoint;
              } else {
                sourceEndpoint = endEndpoint;
                sinkEndpoint = startEndpoint;
              }
            }
          }
        }
      } else if (startDir !== 0) {
        sign = startDir;
        flowDir = startDir > 0 ? "startToEnd" : "endToStart";
        flowConfidence = 2;
        if (startDir > 0) {
          sourceEndpoint = startEndpoint;
          sinkEndpoint = endEndpoint;
        } else {
          sourceEndpoint = endEndpoint;
          sinkEndpoint = startEndpoint;
        }
      } else if (endDir !== 0) {
        sign = -endDir;
        flowDir = sign > 0 ? "startToEnd" : "endToStart";
        flowConfidence = 2;
        if (endDir > 0) {
          sourceEndpoint = endEndpoint;
          sinkEndpoint = startEndpoint;
        } else {
          sourceEndpoint = startEndpoint;
          sinkEndpoint = endEndpoint;
        }
      }

      // Voltage-based fallback only when terminal current directions are ambiguous.
      if (
        flowDir === "unknown" &&
        Number.isFinite(startV) &&
        Number.isFinite(endV) &&
        Math.abs((startV as number) - (endV as number)) > InteractiveWireIntegration.VOLTAGE_EPS
      ) {
        sign = (startV as number) >= (endV as number) ? 1 : -1;
        flowDir = sign > 0 ? "startToEnd" : "endToStart";
        flowConfidence = 1;
        if (sign > 0) {
          sourceEndpoint = startEndpoint;
          sinkEndpoint = endEndpoint;
        } else {
          sourceEndpoint = endEndpoint;
          sinkEndpoint = startEndpoint;
        }
      }

      // Ambiguous fallback: preserve previous stable direction to avoid flicker.
      if (flowDir === "unknown") {
        if (prevFlow === "startToEnd" || prevFlow === "endToStart") {
          flowDir = prevFlow;
          sign = prevFlow === "startToEnd" ? 1 : -1;
          flowConfidence = 0;
        } else if (prevSign !== 0) {
          sign = prevSign;
          flowDir = prevSign > 0 ? "startToEnd" : "endToStart";
          flowConfidence = 0;
        } else {
          sign = 1;
          flowDir = "startToEnd";
          flowConfidence = 0;
        }
        if (sign > 0) {
          sourceEndpoint = startEndpoint;
          sinkEndpoint = endEndpoint;
        } else {
          sourceEndpoint = endEndpoint;
          sinkEndpoint = startEndpoint;
        }
      }

      // Hysteresis: don't flip direction on weak evidence and tiny current.
      if (
        prevFlow &&
        prevFlow !== "unknown" &&
        flowDir !== prevFlow &&
        flowConfidence <= 1 &&
        currentMagnitude < InteractiveWireIntegration.FLIP_HOLD_CURRENT_A
      ) {
        flowDir = prevFlow;
        sign = prevFlow === "startToEnd" ? 1 : -1;
        if (sign > 0) {
          sourceEndpoint = startEndpoint;
          sinkEndpoint = endEndpoint;
        } else {
          sourceEndpoint = endEndpoint;
          sinkEndpoint = startEndpoint;
        }
      }

      wire.current = sign * currentMagnitude;
      wire.voltage = componentVoltages[startCompId ?? ""]?.[startNodeId ?? ""] ?? 0;
      (wire as any).flowDirEndpoint = flowDir;
      (wire as any).flowDirSign = sign;
      (wire as any).flowConfidence = flowConfidence;
      (wire as any).flowSource = sourceEndpoint
        ? {
            componentId: sourceEndpoint.componentId,
            nodeId: sourceEndpoint.nodeId,
            x: sourceEndpoint.x,
            y: sourceEndpoint.y,
          }
        : null;
      (wire as any).flowSink = sinkEndpoint
        ? {
            componentId: sinkEndpoint.componentId,
            nodeId: sinkEndpoint.nodeId,
            x: sinkEndpoint.x,
            y: sinkEndpoint.y,
          }
        : null;
      (wire as any).startDir = startDir;
      (wire as any).endDir = endDir;
    });

    this.wireSystem.getWires().forEach((wire) => {
      this.applyEducationalWireDirectionCorrections(wire);
    });
  }

  /** Flip signed wire.current + flow metadata (used by scene net coherency pass). */
  public flipDisplayedWireCurrent(wire: InteractiveWireConnection): void {
    this.invertWireFlowVisual(wire);
  }

  private invertWireFlowVisual(wire: InteractiveWireConnection): void {
    const eps = InteractiveWireIntegration.CURRENT_EPS;
    if (Math.abs(wire.current) < eps) return;
    wire.current = -wire.current;
    const fd = (wire as any).flowDirEndpoint as EndpointFlowDirection | undefined;
    if (fd === "startToEnd") (wire as any).flowDirEndpoint = "endToStart";
    else if (fd === "endToStart") (wire as any).flowDirEndpoint = "startToEnd";
    const fs = (wire as any).flowSource;
    (wire as any).flowSource = (wire as any).flowSink;
    (wire as any).flowSink = fs;
    const s = (wire as any).flowDirSign;
    if (s === 1 || s === -1) (wire as any).flowDirSign = -s;
  }

  /**
   * Battery +: conventional current leaves + toward the opposite pin.
   * Ground ↔ battery− jumper: show conventional current flowing *into* the − terminal
   * (return current), i.e. toward the battery pin—not away from it toward the GND symbol.
   * Endpoint order fixes the needed sign (invert only when the solver/visual pipeline disagrees).
   */
  private applyEducationalWireDirectionCorrections(
    wire: InteractiveWireConnection,
  ): void {
    const eps = InteractiveWireIntegration.CURRENT_EPS;
    if (Math.abs(wire.current) < eps) return;

    const { first: a, second: b } = orderedComponentEndpointsForWire(wire);
    if (!a || !b) return;
    if (!a.componentId || !b.componentId) return;

    const type = (cid: string) => this.wireSystem.getComponentType(cid);
    const isGroundPin = (n: WireNode) => n.nodeId === "ground";
    const isBatPlus = (n: WireNode) =>
      n.nodeId === "positive" && type(n.componentId!) === "battery";
    const isBatNeg = (n: WireNode) =>
      n.nodeId === "negative" && type(n.componentId!) === "battery";

    const aPlus = isBatPlus(a);
    const bPlus = isBatPlus(b);
    if (aPlus !== bPlus) {
      const wantPositiveStartToEnd = aPlus && !bPlus;
      const ok =
        (wantPositiveStartToEnd && wire.current > eps) ||
        (!wantPositiveStartToEnd && wire.current < -eps);
      if (!ok) this.invertWireFlowVisual(wire);
    }

    const ga = isGroundPin(a);
    const gb = isGroundPin(b);
    if (ga !== gb) {
      const other = ga ? b : a;
      const otherIsBatPlus =
        other.nodeId === "positive" && type(other.componentId!) === "battery";
      if (otherIsBatPlus) return;
      if (!isBatNeg(other)) return;
      // wire.current > 0 ⇒ flow component endpoint[0] → endpoint[1]. We want flow into − pin.
      const batNegAtEnd = isBatNeg(b);
      const wantSign: 1 | -1 = batNegAtEnd ? 1 : -1;
      const haveSign: 1 | -1 = wire.current > eps ? 1 : -1;
      if (haveSign !== wantSign) this.invertWireFlowVisual(wire);
    }
  }

  /**
   * Determine if external current exits (+1) or enters (-1) a component terminal.
   * Returns 0 if ambiguous (component current ≈ 0).
   *
   * Convention: terminal current positive = enters component from wire,
   *             terminal current negative = exits component into wire.
   * All components must set node.current following this convention.
   */
  private getExternalCurrentDirection(
    compId: string | undefined,
    nodeId: string | undefined,
    componentCurrents: Record<string, Record<string, number>>,
    _componentVoltages: Record<string, Record<string, number>>
  ): number {
    if (!compId || !nodeId) return 0;

    const termCurrents = componentCurrents[compId];
    if (!termCurrents) return 0;

    const termCurrent = termCurrents[nodeId] ?? 0;
    if (Math.abs(termCurrent) < 1e-9) return 0;

    // Snapshot / node.current: positive = enters terminal from wire (see EnhancedCircuitSolver).
    // Wire direction helper: +1 = exits terminal into wire, -1 = enters from wire.
    // So positive terminal current → -1; negative → +1.
    return termCurrent < 0 ? 1 : -1;
  }

  /**
   * Enable wire edit mode
   */
  public enableWireEditMode(): void {
    this.editMode.enabled = true;
    console.log("✏️ Wire edit mode enabled");
    this.showEditInstructions();
  }

  /**
   * Disable wire edit mode
   */
  public disableWireEditMode(): void {
    this.editMode.enabled = false;
    this.editMode.selectedWire = null;
    this.editMode.dragPoint = null;
    console.log("✏️ Wire edit mode disabled");
  }

  /**
   * Toggle wire edit mode
   */
  public toggleWireEditMode(): void {
    if (this.editMode.enabled) {
      this.disableWireEditMode();
    } else {
      this.enableWireEditMode();
    }
  }

  /**
   * Show edit instructions
   */
  private showEditInstructions(): void {
    const instructions = document.createElement("div");
    instructions.id = "wire-edit-instructions";
    instructions.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 15px;
        border-radius: 8px;
        font-family: monospace;
        font-size: 12px;
        z-index: 1000;
        max-width: 300px;
      ">
        <h4 style="margin: 0 0 10px 0; color: #00ff00;">🔧 Wire Edit Mode</h4>
        <p style="margin: 5px 0;"><strong>Click & Drag:</strong> Reroute wires</p>
        <p style="margin: 5px 0;"><strong>Drag to Wire:</strong> Join wires</p>
        <p style="margin: 5px 0;"><strong>Delete Key:</strong> Delete wire to nearest node</p>
        <p style="margin: 5px 0;"><strong>Ctrl+J:</strong> Toggle junction nodes</p>
        <p style="margin: 5px 0;"><strong>Ctrl+R:</strong> Reroute selected wire</p>
        <p style="margin: 5px 0;"><strong>Escape:</strong> Cancel edit</p>
        <button onclick="this.parentElement.remove()" style="
          background: #ff4444;
          color: white;
          border: none;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 10px;
        ">Close</button>
      </div>
    `;

    document.body.appendChild(instructions);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (instructions.parentElement) {
        instructions.remove();
      }
    }, 10000);
  }

  /**
   * Cancel wire edit
   */
  private cancelWireEdit(): void {
    this.editMode.selectedWire = null;
    this.editMode.dragPoint = null;
    console.log("❌ Wire edit cancelled");
  }

  /**
   * Delete selected wire
   */
  private deleteSelectedWire(): void {
    if (!this.editMode.selectedWire) return;

    const success = this.wireSystem.removeWire(this.editMode.selectedWire);
    if (success) {
      this.editMode.selectedWire = null;
      console.log(`🗑️ Deleted wire ${this.editMode.selectedWire}`);
    }
  }

  /**
   * Toggle junction nodes visibility
   */
  private toggleJunctionNodes(): void {
    this.options.showJunctionNodes = !this.options.showJunctionNodes;
    console.log(
      `🔗 Junction nodes ${this.options.showJunctionNodes ? "shown" : "hidden"}`
    );
  }

  /**
   * Reroute selected wire
   */
  private rerouteSelectedWire(): void {
    if (!this.editMode.selectedWire) return;

    const wire = this.wireSystem.getWires().get(this.editMode.selectedWire);
    if (!wire) return;

    // Trigger automatic rerouting
    console.log(`🔄 Rerouting wire ${this.editMode.selectedWire}`);
  }

  /**
   * Get routing statistics
   */
  public getRoutingStats(): {
    totalWires: number;
    totalJunctions: number;
    totalNodes: number;
    averageSegmentsPerWire: number;
    totalWireLength: number;
  } {
    const wires = this.wireSystem.getWires();
    const nodes = this.wireSystem.getNodes();

    let totalSegments = 0;
    let totalLength = 0;
    let junctionCount = 0;

    wires.forEach((wire) => {
      totalSegments += wire.segments.length;
      totalLength += wire.segments.reduce((sum, segment) => {
        const dx = segment.end.x - segment.start.x;
        const dy = segment.end.y - segment.start.y;
        return sum + Math.sqrt(dx * dx + dy * dy);
      }, 0);
    });

    nodes.forEach((node) => {
      if (node.type === "junction") {
        junctionCount++;
      }
    });

    return {
      totalWires: wires.size,
      totalJunctions: junctionCount,
      totalNodes: nodes.size,
      averageSegmentsPerWire: wires.size > 0 ? totalSegments / wires.size : 0,
      totalWireLength: totalLength,
    };
  }

  /**
   * Set wire edit options
   */
  public setOptions(options: Partial<WireEditOptions>): void {
    this.options = { ...this.options, ...options };
    console.log("⚙️ Wire edit options updated:", this.options);
  }

  /**
   * Get current options
   */
  public getOptions(): WireEditOptions {
    return { ...this.options };
  }

  /**
   * Get wire system
   */
  public getWireSystem(): InteractiveWireSystem {
    return this.wireSystem;
  }

  /**
   * Add component to wire system
   */
  public addComponent(component: CircuitComponent): void {
    this.wireSystem.addComponent(component);
  }

  /**
   * Remove component from wire system
   */
  public removeComponent(componentId: string): void {
    this.wireSystem.removeComponent(componentId);
  }

  /**
   * Clear all wires
   */
  public clearWires(): void {
    this.wireSystem.clearWires();
  }

  /**
   * Get all wires
   */
  public getWires(): Map<string, InteractiveWireConnection> {
    return this.wireSystem.getWires();
  }

  /**
   * Get all nodes
   */
  public getNodes(): Map<string, WireNode> {
    return this.wireSystem.getNodes();
  }

  /**
   * Update wire positions when components move
   */
  public updateWirePositions(componentId: string): void {
    this.wireSystem.updateWirePositions(componentId);
  }

  /**
   * Full reroute of all wires (e.g. after importing a saved circuit).
   */
  public refreshAllWireGeometry(): void {
    this.wireSystem.refreshAllWireGeometry();
  }

  /**
   * Select wire at point
   */
  public selectWireAtPoint(x: number, y: number): boolean {
    return this.wireSystem.selectWireAtPoint(x, y);
  }

  /**
   * Set the wire routing strategy
   */
  public setRoutingStrategy(strategy: "orthogonal" | "astar" | "hybrid"): void {
    this.wireSystem.setRoutingStrategy(strategy);
  }

  /**
   * Test the open-source routing algorithms
   */
  public testOpenSourceRouting(): void {
    this.wireSystem.testOpenSourceRouting();
  }

  /**
   * Destroy the integration
   */
  public destroy(): void {
    this.wireSystem.destroy();
  }
}

/**
 * Wire Edit Mode Toggle Button
 */
export class WireEditToggle {
  private button: HTMLButtonElement;
  private integration: InteractiveWireIntegration;
  private isActive: boolean = false;

  constructor(integration: InteractiveWireIntegration) {
    this.integration = integration;
    this.createButton();
  }

  private createButton(): void {
    this.button = document.createElement("button");
    this.button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
      </svg>
      <span>Wire Edit Mode</span>
    `;

    this.button.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px 15px;
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: all 0.3s ease;
      z-index: 1000;
      display: none; /* Hidden by default since wire editing is always enabled */
      align-items: center;
      gap: 8px;
    `;

    this.button.addEventListener("click", () => this.toggle());
    this.button.addEventListener("mouseenter", () => {
      this.button.style.transform = "translateY(-2px)";
      this.button.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.2)";
    });
    this.button.addEventListener("mouseleave", () => {
      this.button.style.transform = "translateY(0)";
      this.button.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
    });

    document.body.appendChild(this.button);
  }

  private toggle(): void {
    this.isActive = !this.isActive;

    if (this.isActive) {
      this.integration.enableWireEditMode();
      this.button.style.background =
        "linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)";
      this.button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
        <span>Exit Edit</span>
      `;
    } else {
      this.integration.disableWireEditMode();
      this.button.style.background =
        "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
      this.button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
        </svg>
        <span>Edit Wires</span>
      `;
    }
  }

  public destroy(): void {
    if (this.button.parentElement) {
      this.button.parentElement.removeChild(this.button);
    }
  }
}
