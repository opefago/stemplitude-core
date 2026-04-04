/**
 * Interactive Wire System with Advanced Editing Capabilities
 *
 * Features:
 * - Drag wires to change routing
 * - Join wires at any point
 * - Delete wires up to nearest nodes
 * - Visual feedback and snapping
 * - Route caching and optimization
 *
 * Version: 2.2 - Enhanced wire routing for complex scenarios
 */

import { Graphics, Container, Point, FederatedPointerEvent } from "pixi.js";
import { CircuitComponent } from "./CircuitComponent";
import {
  OptimizedWireRouter,
  RoutingPoint,
  WirePath,
} from "./OptimizedWireRouter";
import { HybridWireRouter } from "./HybridWireRouter";
import { GridCanvas } from "./GridCanvas";

// Keep warnings/errors, silence verbose dev logs for this module.
const console = {
  ...globalThis.console,
  log: (..._args: unknown[]) => {},
};

export interface WireNode {
  id: string;
  x: number;
  y: number;
  type: "component" | "junction" | "waypoint";
  componentId?: string;
  nodeId?: string;
  connectedWires: string[];
}

export interface InteractiveWireConnection {
  id: string;
  nodes: WireNode[];
  segments: WireSegment[];
  graphics: Graphics;
  isSelected: boolean;
  isDragging: boolean;
  dragPoint?: { x: number; y: number };
  current: number;
  voltage: number;
  cachedRoutes: Map<string, WirePath>; // Cache for different routing options
}

export interface WireSegment {
  start: RoutingPoint;
  end: RoutingPoint;
  isHorizontal: boolean;
  layer: number;
}

export interface WireInteractionState {
  selectedWire: string | null;
  hoveredWire: string | null;
  hoveredSegment: number | null;
  dragMode: "none" | "reroute" | "join" | "delete";
  snapThreshold: number;
  pointerDown?: { x: number; y: number } | null;
  dragOperation?:
    | "none"
    | "segment"
    | "endpoint_start"
    | "endpoint_end"
    | "reroute";
  activeSegmentIndex?: number | null;
}

/**
 * Interactive wire system with advanced editing capabilities
 */
export class InteractiveWireSystem {
  private router: OptimizedWireRouter;
  private hybridRouter: HybridWireRouter;
  private wires: Map<string, InteractiveWireConnection>;
  private wireContainer: Container;
  private gridCanvas: GridCanvas;
  private components: Map<string, CircuitComponent>;
  private nodes: Map<string, WireNode>;
  private nextNodeId: number = 0;

  // Interaction state
  private interactionState: WireInteractionState;

  // Visual settings
  private wireColor: number = 0x00ff00; // White - most visible
  private wireThickness: number = 4; // Even thicker for better visibility
  private selectedWireColor: number = 0xffff00;
  private hoveredWireColor: number = 0x00ffff;
  private junctionColor: number = 0xff6600;
  private snapColor: number = 0x00ff00;

  // Visual feedback
  private selectionGraphics: Graphics;
  private hoverGraphics: Graphics;
  private snapGraphics: Graphics;
  private junctionGraphics: Graphics;

  constructor(gridCanvas: GridCanvas) {
    this.gridCanvas = gridCanvas;
    this.wires = new Map();
    this.wireContainer = new Container();
    this.components = new Map();
    this.nodes = new Map();

    // Start continuous update loop for wire position updates
    // this.startUpdateLoop(); // DISABLED - causing continuous getNodePosition calls

    // Initialize router
    const gridDims = gridCanvas.getGridDimensions();
    console.log(
      `🔍 Grid dimensions: width=${gridDims.width}, height=${gridDims.height}`
    );
    this.router = new OptimizedWireRouter(gridDims.width, gridDims.height, 10, {
      preferOrthogonal: true,
      minimizeBends: true,
      avoidComponents: true,
      enablePostProcessing: true,
      mergeCollinearSegments: true,
      enableCaching: true,
      maxSearchIterations: 8000,
    });

    // Initialize hybrid router with open-source algorithms
    this.hybridRouter = new HybridWireRouter(
      gridDims.width,
      gridDims.height,
      10
    );
    console.log(
      "🚀 Initialized HybridWireRouter with Dagre.js and A* algorithms"
    );

    // Initialize interaction state
    this.interactionState = {
      selectedWire: null,
      hoveredWire: null,
      hoveredSegment: null,
      dragMode: "none",
      snapThreshold: 15,
      pointerDown: null,
      dragOperation: "none",
      activeSegmentIndex: null,
    };

    // Create visual feedback graphics
    this.selectionGraphics = new Graphics();
    this.hoverGraphics = new Graphics();
    this.snapGraphics = new Graphics();
    this.junctionGraphics = new Graphics();

    this.wireContainer.addChild(this.selectionGraphics);
    this.wireContainer.addChild(this.hoverGraphics);
    this.wireContainer.addChild(this.snapGraphics);
    this.wireContainer.addChild(this.junctionGraphics);

    this.setupEventListeners();
  }

  /**
   * Setup event listeners for wire interaction
   */
  private setupEventListeners(): void {
    // Enable Pixi v7 event system
    (this.wireContainer as any).eventMode = "static";
    this.wireContainer.interactive = true;
    this.wireContainer.on("pointerdown", this.onPointerDown.bind(this));
    this.wireContainer.on("pointermove", this.onPointerMove.bind(this));
    this.wireContainer.on("pointerup", this.onPointerUp.bind(this));
    this.wireContainer.on("pointerover", this.onPointerOver.bind(this));
    this.wireContainer.on("pointerout", this.onPointerOut.bind(this));

    // Keyboard support: Esc/Delete/Backspace delete selected wire
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Delete" || e.key === "Backspace") {
        const deleted = this.deleteSelectedWire();
        if (deleted) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    });

    // Global pointer listeners to ensure drag works even if cursor leaves container
    window.addEventListener("pointermove", (e: PointerEvent) => {
      if (this.interactionState.pointerDown) {
        this.onPointerMove({ global: { x: e.clientX, y: e.clientY } } as any);
      }
    });
    window.addEventListener("pointerup", (e: PointerEvent) => {
      if (this.interactionState.pointerDown) {
        this.onPointerUp({ global: { x: e.clientX, y: e.clientY } } as any);
      }
    });
  }

  /**
   * Handle pointer down events
   */
  private onPointerDown(event: FederatedPointerEvent): void {
    const wire = this.findWireAtPoint(event.global);
    if (!wire) return;

    this.interactionState.selectedWire = wire.id;
    this.interactionState.dragMode = "none"; // start as selection only
    this.interactionState.pointerDown = {
      x: event.global.x,
      y: event.global.y,
    };

    // Find the closest segment to the click point
    const segmentIndex = this.getClosestSegmentIndex(wire, event.global);
    if (segmentIndex !== -1) {
      this.interactionState.hoveredSegment = segmentIndex;
      this.interactionState.activeSegmentIndex = segmentIndex;
      wire.dragPoint = { x: event.global.x, y: event.global.y } as any;
      wire.isDragging = false; // only after threshold will we enable dragging

      // If drag near an endpoint, allow growing/shrinking by moving that endpoint
      const first = wire.segments[0];
      const last = wire.segments[wire.segments.length - 1];
      const near = (p: { x: number; y: number }) =>
        Math.hypot(p.x - event.global.x, p.y - event.global.y) <= 12;

      if (near(first.start)) {
        // Dragging start endpoint
        (wire.dragPoint as any).__endpoint = "start";
        this.interactionState.dragOperation = "endpoint_start";
      } else if (near(last.end)) {
        // Dragging end endpoint
        (wire.dragPoint as any).__endpoint = "end";
        this.interactionState.dragOperation = "endpoint_end";
      } else {
        this.interactionState.dragOperation = "segment";
      }
    }

    this.updateVisuals();
    event.stopPropagation();
  }

  /**
   * Handle pointer move events
   */
  private onPointerMove(event: FederatedPointerEvent): void {
    if (this.interactionState.selectedWire) {
      const wire = this.wires.get(this.interactionState.selectedWire);
      if (wire && wire.dragPoint) {
        // If we haven't started dragging yet, check threshold
        const down = this.interactionState.pointerDown;
        const movedEnough =
          down &&
          Math.hypot(event.global.x - down.x, event.global.y - down.y) > 6;
        if (!wire.isDragging) {
          if (!movedEnough) return; // still just hovering/selected
          // Start dragging now
          wire.isDragging = true;
          this.interactionState.dragMode = "reroute";
          // Snapshot original path (for memory/restore)
          wire.cachedRoutes.set("preDrag", {
            segments: wire.segments.map((s) => ({
              start: { ...s.start },
              end: { ...s.end },
              isHorizontal: s.isHorizontal,
              layer: s.layer ?? 0,
            })),
            totalLength: 0,
            bendCount: 0,
            layer: 0,
          });
        }
        // Update drag point
        wire.dragPoint = { x: event.global.x, y: event.global.y } as any;

        // Show snap indicators
        this.showSnapIndicators(event.global);

        // Preview new route
        if ((wire.dragPoint as any).__endpoint === "start") {
          // Grow/shrink from start endpoint
          const newStart: RoutingPoint = {
            x: event.global.x,
            y: event.global.y,
            layer: 0,
          };
          const end = wire.segments[wire.segments.length - 1].end;
          const preview = this.routeWireWithBends(newStart, end, []);
          wire.segments = preview.segments;
          // Keep original end node
          wire.segments[wire.segments.length - 1].end = { ...end };
          this.drawWire(wire);
          this.updateSelectionGraphics();
          this.updateJunctionGraphics();
        } else if ((wire.dragPoint as any).__endpoint === "end") {
          // Grow/shrink from end endpoint
          const start = wire.segments[0].start;
          const newEnd: RoutingPoint = {
            x: event.global.x,
            y: event.global.y,
            layer: 0,
          };
          const preview = this.routeWireWithBends(start, newEnd, []);
          wire.segments = preview.segments;
          // Keep original start node
          wire.segments[0].start = { ...start };
          this.drawWire(wire);
          this.updateSelectionGraphics();
          this.updateJunctionGraphics();
        } else {
          // Move the entire contiguous run orthogonally with the mouse
          let idx = this.getClosestSegmentIndex(wire, event.global);
          if (idx < 0) {
            idx =
              this.interactionState.activeSegmentIndex ??
              this.interactionState.hoveredSegment ??
              -1;
          }
          if (idx >= 0 && idx < wire.segments.length) {
            this.moveSegmentWithMouse(
              wire,
              idx,
              event.global.x,
              event.global.y
            );
            // Re-attach to nearest node if this is the top or left outer segment moved toward a node
            this.ensureNodeAnchors(wire);
            this.drawWire(wire);
            this.updateSelectionGraphics();
            this.updateJunctionGraphics();
          } else {
            this.previewReroute(wire, event.global);
          }
        }
      }
    } else {
      // Handle hover effects
      const wire = this.findWireAtPoint(event.global);
      if (wire && wire.id !== this.interactionState.hoveredWire) {
        this.interactionState.hoveredWire = wire.id;
        this.updateVisuals();
      }
    }
  }

  /**
   * Handle pointer up events
   */
  private onPointerUp(event: FederatedPointerEvent): void {
    if (this.interactionState.selectedWire) {
      const wire = this.wires.get(this.interactionState.selectedWire);
      if (wire && wire.isDragging) {
        // If this was a segment/endpoint drag, keep the edited path as-is;
        // only reroute for explicit reroute drags (fallback case)
        const op = this.interactionState.dragOperation;
        // Endpoint drop onto another wire -> create a junction connection wire
        if (op === "endpoint_start" || op === "endpoint_end") {
          const dropPoint = event.global;
          const targetWire = this.findWireAtPoint(dropPoint);
          if (targetWire && targetWire.id !== wire.id) {
            // Snap drop point to nearest point on target wire for clean junction
            const snap = this.getNearestPointOnWire(targetWire, dropPoint);
            // Determine start component/node from the dragged endpoint
            const draggedEndpoint =
              op === "endpoint_start" ? wire.nodes[0] : wire.nodes[1];
            if (draggedEndpoint && draggedEndpoint.type === "component") {
              // Restore edited wire to its pre-drag route if we changed it during preview
              const pre = wire.cachedRoutes.get("preDrag");
              if (pre && pre.segments?.length) {
                wire.segments = pre.segments.map((s: any) => ({ ...s }));
                this.drawWire(wire);
              }
              // Create a new wire from the component node to the target wire (junction)
              const newWireId = `wire_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              this.createWireToWire(
                newWireId,
                draggedEndpoint.componentId!,
                draggedEndpoint.nodeId!,
                { x: snap.x, y: snap.y },
                targetWire.id
              );
            }
          }
        }
        if (
          op === "segment" ||
          op === "endpoint_start" ||
          op === "endpoint_end"
        ) {
          // Preserve current segments (already updated live)
        } else {
          this.applyReroute(wire, event.global);
        }

        // Clear drag state
        wire.isDragging = false;
        wire.dragPoint = undefined;
      }
    }

    this.interactionState.dragMode = "none";
    this.interactionState.pointerDown = null;
    this.interactionState.dragOperation = "none";
    this.clearSnapIndicators();
    this.updateVisuals();
  }

  /**
   * Handle pointer over events
   */
  private onPointerOver(event: FederatedPointerEvent): void {
    const wire = this.findWireAtPoint(event.global);
    if (wire) {
      this.interactionState.hoveredWire = wire.id;
      this.updateVisuals();
    }
  }

  /**
   * Handle pointer out events
   */
  private onPointerOut(event: FederatedPointerEvent): void {
    this.interactionState.hoveredWire = null;
    this.updateVisuals();
  }

  /**
   * Find wire at a specific point
   */
  private findWireAtPoint(point: Point): InteractiveWireConnection | null {
    for (const wire of this.wires.values()) {
      if (this.isPointOnWire(wire, point)) {
        return wire;
      }
    }
    return null;
  }

  /**
   * Check if a point is on a wire
   */
  private isPointOnWire(
    wire: InteractiveWireConnection,
    point: Point
  ): boolean {
    const threshold = 8; // Click tolerance

    for (const segment of wire.segments) {
      const distance = this.distanceToLineSegment(
        point,
        { x: segment.start.x, y: segment.start.y },
        { x: segment.end.x, y: segment.end.y }
      );

      if (distance <= threshold) {
        return true;
      }
    }

    return false;
  }

  /**
   * Compute nearest point on a wire to a given point (orthogonal segments)
   */
  private getNearestPointOnWire(
    wire: InteractiveWireConnection,
    point: Point
  ): { x: number; y: number } {
    let bestX = point.x;
    let bestY = point.y;
    let bestDist = Infinity;

    for (const segment of wire.segments) {
      if (segment.isHorizontal) {
        const minX = Math.min(segment.start.x, segment.end.x);
        const maxX = Math.max(segment.start.x, segment.end.x);
        const clampedX = Math.max(minX, Math.min(point.x, maxX));
        const y = segment.start.y;
        const d = Math.hypot(point.x - clampedX, point.y - y);
        if (d < bestDist) {
          bestDist = d;
          bestX = clampedX;
          bestY = y;
        }
      } else {
        const minY = Math.min(segment.start.y, segment.end.y);
        const maxY = Math.max(segment.start.y, segment.end.y);
        const clampedY = Math.max(minY, Math.min(point.y, maxY));
        const x = segment.start.x;
        const d = Math.hypot(point.x - x, point.y - clampedY);
        if (d < bestDist) {
          bestDist = d;
          bestX = x;
          bestY = clampedY;
        }
      }
    }

    return { x: bestX, y: bestY };
  }

  /**
   * Calculate distance from point to line segment
   */
  private distanceToLineSegment(
    point: Point,
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number }
  ): number {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;

    if (lenSq === 0) return Math.sqrt(A * A + B * B);

    let param = dot / lenSq;

    let xx, yy;
    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Show snap indicators for wire joining
   */
  private showSnapIndicators(point: Point): void {
    this.snapGraphics.clear();

    // Find nearby wires for joining
    const nearbyWires = this.findNearbyWires(
      point,
      this.interactionState.snapThreshold
    );

    for (const wire of nearbyWires) {
      for (const segment of wire.segments) {
        const distance = this.distanceToLineSegment(
          point,
          { x: segment.start.x, y: segment.start.y },
          { x: segment.end.x, y: segment.end.y }
        );

        if (distance <= this.interactionState.snapThreshold) {
          // Draw snap indicator
          this.snapGraphics.circle(point.x, point.y, 6);
          this.snapGraphics.stroke({ width: 2, color: this.snapColor });
        }
      }
    }
  }

  /**
   * Find nearby wires for joining
   */
  private findNearbyWires(
    point: Point,
    threshold: number
  ): InteractiveWireConnection[] {
    const nearbyWires: InteractiveWireConnection[] = [];

    for (const wire of this.wires.values()) {
      if (wire.id === this.interactionState.selectedWire) continue;

      for (const segment of wire.segments) {
        const distance = this.distanceToLineSegment(
          point,
          { x: segment.start.x, y: segment.start.y },
          { x: segment.end.x, y: segment.end.y }
        );

        if (distance <= threshold) {
          nearbyWires.push(wire);
          break;
        }
      }
    }

    return nearbyWires;
  }

  /**
   * Clear snap indicators
   */
  private clearSnapIndicators(): void {
    this.snapGraphics.clear();
  }

  /**
   * Preview wire rerouting
   */
  private previewReroute(wire: InteractiveWireConnection, point: Point): void {
    if (!wire.dragPoint) return;

    // Create preview graphics
    const previewGraphics = new Graphics();
    previewGraphics.moveTo(wire.dragPoint.x, wire.dragPoint.y);
    previewGraphics.lineTo(point.x, point.y);
    previewGraphics.stroke({
      width: 2,
      color: this.selectedWireColor,
      alpha: 0.7,
    });

    // Remove previous preview
    this.wireContainer.removeChild(
      this.wireContainer.children.find((child) => child === previewGraphics) ||
        new Graphics()
    );

    this.wireContainer.addChild(previewGraphics);
  }

  /**
   * Apply wire rerouting
   */
  private applyReroute(wire: InteractiveWireConnection, point: Point): void {
    // Find if we're joining to another wire
    const nearbyWires = this.findNearbyWires(
      point,
      this.interactionState.snapThreshold
    );

    if (nearbyWires.length > 0) {
      // Join wires at this point
      this.joinWires(wire, nearbyWires[0], point);
    } else {
      // Simple reroute
      this.rerouteWire(wire, point);
    }

    this.updateVisuals();
  }

  /**
   * Join two wires at a specific point
   */
  private joinWires(
    wire1: InteractiveWireConnection,
    wire2: InteractiveWireConnection,
    joinPoint: Point
  ): void {
    // Create a junction node
    const junctionId = `junction_${this.nextNodeId++}`;
    const junction: WireNode = {
      id: junctionId,
      x: joinPoint.x,
      y: joinPoint.y,
      type: "junction",
      connectedWires: [wire1.id, wire2.id],
    };

    this.nodes.set(junctionId, junction);

    // Update wire connections
    wire1.nodes.push(junction);
    wire2.nodes.push(junction);

    // Reroute both wires through the junction
    this.rerouteWireThroughJunction(wire1, junction);
    this.rerouteWireThroughJunction(wire2, junction);

    console.log(
      `🔗 Joined wires ${wire1.id} and ${wire2.id} at junction ${junctionId}`
    );
  }

  /**
   * Reroute wire through a junction
   */
  private rerouteWireThroughJunction(
    wire: InteractiveWireConnection,
    junction: WireNode
  ): void {
    // Identify component endpoints (assume 2 endpoints)
    const endpoints = wire.nodes.filter((n) => n.type === "component");
    const startNode = endpoints[0] ?? wire.nodes[0];
    const endNode = endpoints[1] ?? wire.nodes[wire.nodes.length - 1];

    // Route start -> junction
    const pathA = this.router.routeWire(
      { x: startNode.x, y: startNode.y, layer: 0 },
      { x: junction.x, y: junction.y, layer: 0 },
      []
    );
    // Route junction -> end
    const pathB = this.router.routeWire(
      { x: junction.x, y: junction.y, layer: 0 },
      { x: endNode.x, y: endNode.y, layer: 0 },
      []
    );

    // Update node order to [start, junction, end] for clarity
    const newNodes: WireNode[] = [];
    if (startNode) newNodes.push(startNode);
    newNodes.push(junction);
    if (endNode) newNodes.push(endNode);
    wire.nodes = newNodes;

    // Update segments and redraw
    wire.segments = [...pathA.segments, ...pathB.segments];
    this.drawWire(wire);
    this.updateSelectionGraphics();
  }

  /**
   * Reroute wire to a new point with proper drag-to-route functionality
   */
  private rerouteWire(wire: InteractiveWireConnection, point: Point): void {
    // Get the start and end nodes of the wire
    const startNode = wire.nodes[0];
    const endNode = wire.nodes[1];

    if (!startNode || !endNode) return;

    // Create new route from start node to end node through the drag point
    const startPos = { x: startNode.x, y: startNode.y, layer: 0 };
    const endPos = { x: endNode.x, y: endNode.y, layer: 0 };

    // Create a route that goes through the drag point
    const newPath = this.createRouteThroughPoint(startPos, endPos, point);

    // Update wire segments
    wire.segments = newPath.segments;
    this.drawWire(wire);

    console.log(
      `🔄 Rerouted wire ${wire.id} through point (${point.x}, ${point.y})`
    );
  }

  /**
   * Create a route that passes through a specific point
   */
  private createRouteThroughPoint(
    start: RoutingPoint,
    end: RoutingPoint,
    through: Point
  ): WirePath {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const direction = this.getCardinalDirection(dx, dy);

    // Create route based on cardinal direction, but force it through the specified point
    switch (direction) {
      case "top-right":
        return this.createTopRightPathThroughPoint(start, end, through);
      case "top-left":
        return this.createTopLeftPathThroughPoint(start, end, through);
      case "bottom-right":
        return this.createBottomRightPathThroughPoint(start, end, through);
      case "bottom-left":
        return this.createBottomLeftPathThroughPoint(start, end, through);
      default:
        return this.createDefaultPathThroughPoint(start, end, through);
    }
  }

  /**
   * Create top-right path through a specific point
   */
  private createTopRightPathThroughPoint(
    start: RoutingPoint,
    end: RoutingPoint,
    through: Point
  ): WirePath {
    return {
      segments: [
        {
          start: { x: start.x, y: start.y, layer: 0 },
          end: { x: through.x, y: start.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
        {
          start: { x: through.x, y: start.y, layer: 0 },
          end: { x: through.x, y: through.y, layer: 0 },
          isHorizontal: false,
          layer: 0,
        },
        {
          start: { x: through.x, y: through.y, layer: 0 },
          end: { x: end.x, y: end.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
      ],
      totalLength:
        Math.abs(through.x - start.x) +
        Math.abs(through.y - start.y) +
        Math.abs(end.x - through.x) +
        Math.abs(end.y - through.y),
      bendCount: 2,
      layer: 0,
    };
  }

  /**
   * Create top-left path through a specific point
   */
  private createTopLeftPathThroughPoint(
    start: RoutingPoint,
    end: RoutingPoint,
    through: Point
  ): WirePath {
    return {
      segments: [
        {
          start: { x: start.x, y: start.y, layer: 0 },
          end: { x: through.x, y: start.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
        {
          start: { x: through.x, y: start.y, layer: 0 },
          end: { x: through.x, y: through.y, layer: 0 },
          isHorizontal: false,
          layer: 0,
        },
        {
          start: { x: through.x, y: through.y, layer: 0 },
          end: { x: end.x, y: end.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
      ],
      totalLength:
        Math.abs(through.x - start.x) +
        Math.abs(through.y - start.y) +
        Math.abs(end.x - through.x) +
        Math.abs(end.y - through.y),
      bendCount: 2,
      layer: 0,
    };
  }

  /**
   * Create bottom-right path through a specific point
   */
  private createBottomRightPathThroughPoint(
    start: RoutingPoint,
    end: RoutingPoint,
    through: Point
  ): WirePath {
    return {
      segments: [
        {
          start: { x: start.x, y: start.y, layer: 0 },
          end: { x: through.x, y: start.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
        {
          start: { x: through.x, y: start.y, layer: 0 },
          end: { x: through.x, y: through.y, layer: 0 },
          isHorizontal: false,
          layer: 0,
        },
        {
          start: { x: through.x, y: through.y, layer: 0 },
          end: { x: end.x, y: end.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
      ],
      totalLength:
        Math.abs(through.x - start.x) +
        Math.abs(through.y - start.y) +
        Math.abs(end.x - through.x) +
        Math.abs(end.y - through.y),
      bendCount: 2,
      layer: 0,
    };
  }

  /**
   * Create bottom-left path through a specific point
   */
  private createBottomLeftPathThroughPoint(
    start: RoutingPoint,
    end: RoutingPoint,
    through: Point
  ): WirePath {
    return {
      segments: [
        {
          start: { x: start.x, y: start.y, layer: 0 },
          end: { x: through.x, y: start.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
        {
          start: { x: through.x, y: start.y, layer: 0 },
          end: { x: through.x, y: through.y, layer: 0 },
          isHorizontal: false,
          layer: 0,
        },
        {
          start: { x: through.x, y: through.y, layer: 0 },
          end: { x: end.x, y: end.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
      ],
      totalLength:
        Math.abs(through.x - start.x) +
        Math.abs(through.y - start.y) +
        Math.abs(end.x - through.x) +
        Math.abs(end.y - through.y),
      bendCount: 2,
      layer: 0,
    };
  }

  /**
   * Create default path through a specific point
   */
  private createDefaultPathThroughPoint(
    start: RoutingPoint,
    end: RoutingPoint,
    through: Point
  ): WirePath {
    return {
      segments: [
        {
          start: { x: start.x, y: start.y, layer: 0 },
          end: { x: through.x, y: start.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
        {
          start: { x: through.x, y: start.y, layer: 0 },
          end: { x: through.x, y: through.y, layer: 0 },
          isHorizontal: false,
          layer: 0,
        },
        {
          start: { x: through.x, y: through.y, layer: 0 },
          end: { x: end.x, y: end.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
      ],
      totalLength:
        Math.abs(through.x - start.x) +
        Math.abs(through.y - start.y) +
        Math.abs(end.x - through.x) +
        Math.abs(end.y - through.y),
      bendCount: 2,
      layer: 0,
    };
  }

  /**
   * Delete wire up to nearest node
   */
  public deleteWireToNearestNode(wireId: string, point: Point): boolean {
    const wire = this.wires.get(wireId);
    if (!wire) return false;

    // Find the nearest node to the deletion point
    let nearestNode: WireNode | null = null;
    let minDistance = Infinity;

    for (const node of wire.nodes) {
      const distance = Math.sqrt(
        Math.pow(node.x - point.x, 2) + Math.pow(node.y - point.y, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearestNode = node;
      }
    }

    if (!nearestNode) return false;

    // Delete wire up to the nearest node
    if (nearestNode.type === "component") {
      // Delete entire wire
      this.removeWire(wireId);
    } else if (nearestNode.type === "junction") {
      // Delete wire up to junction, keep junction
      this.deleteWireToJunction(wire, nearestNode);
    }

    console.log(`🗑️ Deleted wire ${wireId} up to node ${nearestNode.id}`);
    return true;
  }

  /**
   * Delete wire up to a junction
   */
  private deleteWireToJunction(
    wire: InteractiveWireConnection,
    junction: WireNode
  ): void {
    // Remove wire from junction's connected wires
    const index = junction.connectedWires.indexOf(wire.id);
    if (index !== -1) {
      junction.connectedWires.splice(index, 1);
    }

    // If junction has no more connected wires, remove it
    if (junction.connectedWires.length === 0) {
      this.nodes.delete(junction.id);
    }

    // Remove wire
    this.removeWire(wire.id);
  }

  /**
   * Create a wire that can connect to an existing wire
   */
  public createWireToWire(
    wireId: string,
    startComponent: string,
    startNode: string,
    targetPoint: { x: number; y: number },
    existingWireId?: string
  ): boolean {
    const startComp = this.components.get(startComponent);
    if (!startComp) return false;

    const startPos = this.getNodePosition(startComp, startNode);
    if (!startPos) return false;

    // Create start wire node
    const startWireNode: WireNode = {
      id: `${startComponent}_${startNode}`,
      x: startPos.x,
      y: startPos.y,
      type: "component",
      componentId: startComponent,
      nodeId: startNode,
      connectedWires: [wireId],
    };

    // Check if we're connecting to an existing wire
    if (existingWireId) {
      const existingWire = this.wires.get(existingWireId);
      if (existingWire) {
        // Create junction at target point
        const junctionId = `junction_${this.nextNodeId++}`;
        const junction: WireNode = {
          id: junctionId,
          x: targetPoint.x,
          y: targetPoint.y,
          type: "junction",
          connectedWires: [wireId, existingWireId],
        };

        this.nodes.set(junctionId, junction);

        // Reuse the same junction object for both wires so moves propagate
        const endWireNode: WireNode = junction;

        // Route the wire
        const path = this.router.routeWire(startPos, targetPoint, [
          startComponent,
        ]);

        // Create wire graphics
        const graphics = new Graphics();

        const wire: InteractiveWireConnection = {
          id: wireId,
          nodes: [startWireNode, endWireNode],
          segments: path.segments,
          graphics,
          isSelected: false,
          isDragging: false,
          current: 0,
          voltage: 0,
          cachedRoutes: new Map(),
        };

        this.wires.set(wireId, wire);
        this.wireContainer.addChild(graphics);

        // Store nodes
        this.nodes.set(startWireNode.id, startWireNode);
        this.nodes.set(junctionId, junction);

        // Update existing wire to include junction and tag for drag follow
        existingWire.nodes.push(junction);
        (junction as any).__locksAxis = existingWire.segments.some(
          (s) => s.isHorizontal
        )
          ? existingWire.segments[0].isHorizontal
            ? "y"
            : null
          : existingWire.segments[0].isHorizontal
            ? null
            : "x";
        this.rerouteWireThroughJunction(existingWire, junction);

        this.drawWire(wire);
        return true;
      }
    }

    // Fallback to regular wire creation
    return this.createWire(wireId, startComponent, startNode, "", "");
  }

  /**
   * Create a new wire
   */
  public createWire(
    wireId: string,
    startComponent: string,
    startNode: string,
    endComponent: string,
    endNode: string
  ): boolean {
    const startComp = this.components.get(startComponent);
    const endComp = this.components.get(endComponent);

    if (!startComp || !endComp) {
      console.warn(
        `⚠️ Components not found: ${startComponent} or ${endComponent}`
      );
      return false;
    }

    const startPos = this.getNodePosition(startComp, startNode);
    const endPos = this.getNodePosition(endComp, endNode);

    if (!startPos || !endPos) return false;

    // Create wire nodes
    const startWireNode: WireNode = {
      id: `${startComponent}_${startNode}`,
      x: startPos.x,
      y: startPos.y,
      type: "component",
      componentId: startComponent,
      nodeId: startNode,
      connectedWires: [wireId],
    };

    const endWireNode: WireNode = {
      id: `${endComponent}_${endNode}`,
      x: endPos.x,
      y: endPos.y,
      type: "component",
      componentId: endComponent,
      nodeId: endNode,
      connectedWires: [wireId],
    };

    // Route the wire with proper orthogonal bends
    const path = this.routeWireWithBends(startPos, endPos, [
      startComponent,
      endComponent,
    ]);

    // Create wire graphics
    const graphics = new Graphics();

    const wire: InteractiveWireConnection = {
      id: wireId,
      nodes: [startWireNode, endWireNode],
      segments: path.segments,
      graphics,
      isSelected: false,
      isDragging: false,
      current: 0,
      voltage: 0,
      cachedRoutes: new Map(),
    };

    this.wires.set(wireId, wire);
    this.wireContainer.addChild(graphics);

    // Store nodes
    this.nodes.set(startWireNode.id, startWireNode);
    this.nodes.set(endWireNode.id, endWireNode);

    this.drawWire(wire);
    return true;
  }

  /**
   * Remove a wire
   */
  public removeWire(wireId: string): boolean {
    const wire = this.wires.get(wireId);
    if (!wire) return false;

    this.wireContainer.removeChild(wire.graphics);
    wire.graphics.destroy();
    this.wires.delete(wireId);

    // Clean up nodes
    for (const node of wire.nodes) {
      if (node.type === "junction" && node.connectedWires.length <= 1) {
        this.nodes.delete(node.id);
      }
    }

    // Inform solver that any implicit node connections via this wire should be removed
    try {
      // Each component endpoint is stored as componentId_nodeId in nodes
      const endpoints = wire.nodes.filter((n) => n.type === "component");
      if (endpoints.length === 2) {
        const a = endpoints[0];
        const b = endpoints[1];
        // Best-effort: if EnhancedCircuitSolver is integrated to listen, emit a custom event
        // Consumers can hook this to call solver.disconnectNodes(a.componentId!, a.nodeId!, b.componentId!, b.nodeId!)
        (window as any).dispatchEvent?.(
          new CustomEvent("wire:disconnected", {
            detail: {
              a: { componentId: a.componentId, nodeId: a.nodeId },
              b: { componentId: b.componentId, nodeId: b.nodeId },
              wireId,
            },
          })
        );
      }
    } catch (err) {
      console.warn("⚠️ Failed to notify solver about wire removal:", err);
    }

    return true;
  }

  /**
   * Get node position from component
   */
  private getNodePosition(
    component: CircuitComponent,
    nodeId: string
  ): RoutingPoint | null {
    const nodes = component.getNodes();

    const node = nodes.find((n) => n.id === nodeId);

    if (!node) {
      console.warn(
        `⚠️ Node ${nodeId} not found in component ${component.getName()}`
      );
      return null;
    }

    // Convert relative coordinates to world coordinates
    const componentPos = component.getPosition();
    const worldX = componentPos.x + node.position.x;
    const worldY = componentPos.y + node.position.y;
    return { x: worldX, y: worldY, layer: 0 };
  }

  /**
   * Start continuous update loop for wire position updates
   */
  private startUpdateLoop(): void {
    let lastUpdateTime = 0;
    const updateInterval = 100; // Update every 100ms instead of every frame

    const updateWires = (currentTime: number) => {
      // Only update if we have wires and enough time has passed
      if (
        this.wires.size > 0 &&
        currentTime - lastUpdateTime >= updateInterval
      ) {
        // Update all wire positions based on current component positions
        for (const wire of this.wires.values()) {
          this.updateWirePosition(wire);
        }
        lastUpdateTime = currentTime;
      }
      requestAnimationFrame(updateWires);
    };
    requestAnimationFrame(updateWires);
  }

  /**
   * Update a single wire's position
   */
  private updateWirePosition(wire: InteractiveWireConnection): void {
    const startNode = wire.nodes[0];
    const endNode = wire.nodes[1];

    if (startNode && endNode) {
      const startComp = this.components.get(startNode.componentId!);
      const endComp = this.components.get(endNode.componentId!);

      if (startComp && endComp) {
        const startPos = this.getNodePosition(startComp, startNode.nodeId!);
        const endPos = this.getNodePosition(endComp, endNode.nodeId!);

        if (startPos && endPos) {
          // Check if positions have changed significantly
          const startChanged =
            Math.abs(startNode.x - startPos.x) > 1 ||
            Math.abs(startNode.y - startPos.y) > 1;
          const endChanged =
            Math.abs(endNode.x - endPos.x) > 1 ||
            Math.abs(endNode.y - endPos.y) > 1;

          if (startChanged || endChanged) {
            // Update node positions
            startNode.x = startPos.x;
            startNode.y = startPos.y;
            endNode.x = endPos.x;
            endNode.y = endPos.y;

            // Re-route the wire with better algorithm
            const path = this.routeWireWithBends(startPos, endPos, [
              startNode.componentId!,
              endNode.componentId!,
            ]);

            wire.segments = path.segments;

            // Redraw the wire
            this.drawWire(wire);
          }
        }
      }
    }
  }

  /**
   * Update wire positions when components move
   */
  public updateWirePositions(componentId: string): void {
    console.log(`🔄 Updating wire positions for component: ${componentId}`);

    // Find all wires connected to this component
    const connectedWires = Array.from(this.wires.values()).filter((wire) =>
      wire.nodes.some((node) => node.componentId === componentId)
    );

    console.log(`🔄 Found ${connectedWires.length} connected wires`);

    for (const wire of connectedWires) {
      // Recalculate wire positions
      const startNode = wire.nodes[0];
      const endNode = wire.nodes[1];

      if (startNode && endNode) {
        const startComp = this.components.get(startNode.componentId!);
        const endComp = this.components.get(endNode.componentId!);

        if (startComp && endComp) {
          const startPos = this.getNodePosition(startComp, startNode.nodeId!);
          const endPos = this.getNodePosition(endComp, endNode.nodeId!);

          if (startPos && endPos) {
            // Update node positions
            startNode.x = startPos.x;
            startNode.y = startPos.y;
            endNode.x = endPos.x;
            endNode.y = endPos.y;

            // Re-route the wire with proper orthogonal bends
            const path = this.routeWireWithBends(startPos, endPos, [
              startNode.componentId!,
              endNode.componentId!,
            ]);

            wire.segments = path.segments;

            // Redraw the wire
            this.drawWire(wire);

            console.log(`🔄 Updated wire ${wire.id} with new positions`);
          }
        }
      }
    }
  }

  /**
   * Route wire using open-source algorithms (Dagre.js and A*)
   */
  private routeWireWithBends(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponents: string[]
  ): WirePath {
    console.log(
      `🧭 Routing wire using open-source algorithms from (${start.x}, ${start.y}) to (${end.x}, ${end.y})`
    );

    // Use the hybrid router with Dagre.js and A* algorithms
    let path = this.hybridRouter.routeWire(start, end, avoidComponents);

    // Snap endpoints to exact node positions and clean up segments
    path = this.postProcessPath(path, start, end);

    console.log(
      `✅ Open-source routing result: ${path.segments.length} segments, ${path.totalLength.toFixed(2)}px, ${path.bendCount} bends`
    );

    return path;
  }

  /**
   * Ensure the path anchors exactly at start/end nodes and is clean
   */
  private postProcessPath(
    path: WirePath,
    start: RoutingPoint,
    end: RoutingPoint
  ): WirePath {
    if (!path || !path.segments || path.segments.length === 0) {
      return { segments: [], totalLength: 0, bendCount: 0, layer: 0 };
    }

    // Clone segments to avoid mutating router internals
    const segments = path.segments.map((s) => ({
      start: { x: s.start.x, y: s.start.y, layer: s.start.layer ?? 0 },
      end: { x: s.end.x, y: s.end.y, layer: s.end.layer ?? 0 },
      isHorizontal: s.isHorizontal,
      layer: s.layer ?? 0,
    }));

    // Force first and last endpoints to match node positions
    segments[0].start.x = start.x;
    segments[0].start.y = start.y;
    segments[segments.length - 1].end.x = end.x;
    segments[segments.length - 1].end.y = end.y;

    // Snap intermediate joints so each segment connects exactly
    for (let i = 0; i < segments.length - 1; i++) {
      segments[i + 1].start.x = segments[i].end.x;
      segments[i + 1].start.y = segments[i].end.y;
    }

    // Merge collinear adjacent segments
    const merged: typeof segments = [];
    for (const seg of segments) {
      const last = merged[merged.length - 1];
      if (
        last &&
        last.isHorizontal === seg.isHorizontal &&
        last.end.x === seg.start.x &&
        last.end.y === seg.start.y
      ) {
        last.end.x = seg.end.x;
        last.end.y = seg.end.y;
      } else {
        merged.push(seg);
      }
    }

    // Recompute metrics
    const totalLength = merged.reduce(
      (acc, s) => acc + Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y),
      0
    );
    let bends = 0;
    for (let i = 1; i < merged.length; i++) {
      if (merged[i].isHorizontal !== merged[i - 1].isHorizontal) bends++;
    }

    return { segments: merged, totalLength, bendCount: bends, layer: 0 };
  }

  /**
   * Determine cardinal direction from start to end
   */
  private getCardinalDirection(dx: number, dy: number): string {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Determine primary direction
    if (absDx > absDy * 1.5) {
      // Primarily horizontal
      return dx > 0 ? "right" : "left";
    } else if (absDy > absDx * 1.5) {
      // Primarily vertical
      return dy > 0 ? "bottom" : "top";
    } else {
      // Diagonal
      if (dx > 0 && dy < 0) return "top-right";
      if (dx < 0 && dy < 0) return "top-left";
      if (dx > 0 && dy > 0) return "bottom-right";
      if (dx < 0 && dy > 0) return "bottom-left";
    }

    return "default";
  }

  /**
   * Create path for top-right direction (start bottom-left, end top-right)
   */
  private createTopRightPath(start: RoutingPoint, end: RoutingPoint): WirePath {
    const bendDistance = this.calculateOptimalBendDistance(start, end);
    const bendX = start.x + bendDistance;
    const bendY = end.y - bendDistance;

    return {
      segments: [
        {
          start: { x: start.x, y: start.y, layer: 0 },
          end: { x: bendX, y: start.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
        {
          start: { x: bendX, y: start.y, layer: 0 },
          end: { x: bendX, y: bendY, layer: 0 },
          isHorizontal: false,
          layer: 0,
        },
        {
          start: { x: bendX, y: bendY, layer: 0 },
          end: { x: end.x, y: end.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
      ],
      totalLength:
        bendDistance + Math.abs(bendY - start.y) + Math.abs(end.x - bendX),
      bendCount: 2,
      layer: 0,
    };
  }

  /**
   * Create path for top-left direction (start bottom-right, end top-left)
   */
  private createTopLeftPath(start: RoutingPoint, end: RoutingPoint): WirePath {
    const bendDistance = this.calculateOptimalBendDistance(start, end);
    const bendX = start.x - bendDistance;
    const bendY = end.y - bendDistance;

    return {
      segments: [
        {
          start: { x: start.x, y: start.y, layer: 0 },
          end: { x: bendX, y: start.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
        {
          start: { x: bendX, y: start.y, layer: 0 },
          end: { x: bendX, y: bendY, layer: 0 },
          isHorizontal: false,
          layer: 0,
        },
        {
          start: { x: bendX, y: bendY, layer: 0 },
          end: { x: end.x, y: end.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
      ],
      totalLength:
        bendDistance + Math.abs(bendY - start.y) + Math.abs(end.x - bendX),
      bendCount: 2,
      layer: 0,
    };
  }

  /**
   * Create path for bottom-right direction (start top-left, end bottom-right)
   */
  private createBottomRightPath(
    start: RoutingPoint,
    end: RoutingPoint
  ): WirePath {
    const bendDistance = this.calculateOptimalBendDistance(start, end);
    const bendX = start.x + bendDistance;
    const bendY = end.y + bendDistance;

    return {
      segments: [
        {
          start: { x: start.x, y: start.y, layer: 0 },
          end: { x: bendX, y: start.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
        {
          start: { x: bendX, y: start.y, layer: 0 },
          end: { x: bendX, y: bendY, layer: 0 },
          isHorizontal: false,
          layer: 0,
        },
        {
          start: { x: bendX, y: bendY, layer: 0 },
          end: { x: end.x, y: end.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
      ],
      totalLength:
        bendDistance + Math.abs(bendY - start.y) + Math.abs(end.x - bendX),
      bendCount: 2,
      layer: 0,
    };
  }

  /**
   * Create path for bottom-left direction (start top-right, end bottom-left)
   */
  private createBottomLeftPath(
    start: RoutingPoint,
    end: RoutingPoint
  ): WirePath {
    const bendDistance = this.calculateOptimalBendDistance(start, end);
    const bendX = start.x - bendDistance;
    const bendY = end.y + bendDistance;

    return {
      segments: [
        {
          start: { x: start.x, y: start.y, layer: 0 },
          end: { x: bendX, y: start.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
        {
          start: { x: bendX, y: start.y, layer: 0 },
          end: { x: bendX, y: bendY, layer: 0 },
          isHorizontal: false,
          layer: 0,
        },
        {
          start: { x: bendX, y: bendY, layer: 0 },
          end: { x: end.x, y: end.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
      ],
      totalLength:
        bendDistance + Math.abs(bendY - start.y) + Math.abs(end.x - bendX),
      bendCount: 2,
      layer: 0,
    };
  }

  /**
   * Create path for right direction
   */
  private createRightPath(start: RoutingPoint, end: RoutingPoint): WirePath {
    return {
      segments: [
        {
          start: { x: start.x, y: start.y, layer: 0 },
          end: { x: end.x, y: end.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
      ],
      totalLength: Math.abs(end.x - start.x),
      bendCount: 0,
      layer: 0,
    };
  }

  /**
   * Create path for left direction
   */
  private createLeftPath(start: RoutingPoint, end: RoutingPoint): WirePath {
    return {
      segments: [
        {
          start: { x: start.x, y: start.y, layer: 0 },
          end: { x: end.x, y: end.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
      ],
      totalLength: Math.abs(start.x - end.x),
      bendCount: 0,
      layer: 0,
    };
  }

  /**
   * Create path for top direction
   */
  private createTopPath(start: RoutingPoint, end: RoutingPoint): WirePath {
    return {
      segments: [
        {
          start: { x: start.x, y: start.y, layer: 0 },
          end: { x: end.x, y: end.y, layer: 0 },
          isHorizontal: false,
          layer: 0,
        },
      ],
      totalLength: Math.abs(start.y - end.y),
      bendCount: 0,
      layer: 0,
    };
  }

  /**
   * Create path for bottom direction
   */
  private createBottomPath(start: RoutingPoint, end: RoutingPoint): WirePath {
    return {
      segments: [
        {
          start: { x: start.x, y: start.y, layer: 0 },
          end: { x: end.x, y: end.y, layer: 0 },
          isHorizontal: false,
          layer: 0,
        },
      ],
      totalLength: Math.abs(end.y - start.y),
      bendCount: 0,
      layer: 0,
    };
  }

  /**
   * Calculate optimal bend distance based on component positions and node bounds
   */
  private calculateOptimalBendDistance(
    start: RoutingPoint,
    end: RoutingPoint
  ): number {
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);

    // Calculate the minimum distance to avoid overlapping with components
    const minDistance = 15; // Minimum clearance from components

    // Use a percentage of the shorter distance, but ensure minimum clearance
    const percentage = 0.2; // 20% of the shorter distance
    const calculatedDistance = Math.min(dx, dy) * percentage;

    // Ensure we don't exceed half the distance to avoid going past the midpoint
    const maxDistance = Math.min(dx, dy) * 0.5;

    // Return the optimal distance, bounded by minimum clearance and maximum distance
    return Math.max(minDistance, Math.min(calculatedDistance, maxDistance));
  }

  /**
   * Create default path for complex cases
   */
  private createDefaultPath(start: RoutingPoint, end: RoutingPoint): WirePath {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const midX = start.x + dx / 2;
    const midY = start.y + dy / 2;

    return {
      segments: [
        {
          start: { x: start.x, y: start.y, layer: 0 },
          end: { x: midX, y: start.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
        {
          start: { x: midX, y: start.y, layer: 0 },
          end: { x: midX, y: midY, layer: 0 },
          isHorizontal: false,
          layer: 0,
        },
        {
          start: { x: midX, y: midY, layer: 0 },
          end: { x: end.x, y: end.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
      ],
      totalLength: Math.abs(dx) + Math.abs(dy),
      bendCount: 2,
      layer: 0,
    };
  }

  /**
   * Draw a wire
   */
  private drawWire(wire: InteractiveWireConnection): void {
    const graphics = wire.graphics;
    graphics.clear();

    // Set wire color based on state
    let color = this.wireColor;
    if (wire.isSelected) {
      color = this.selectedWireColor;
    } else if (wire.id === this.interactionState.hoveredWire) {
      color = this.hoveredWireColor;
    }

    // Draw each segment independently to avoid any polygon artifacts
    if (wire.segments.length > 0) {
      for (const segment of wire.segments) {
        graphics.moveTo(segment.start.x, segment.start.y);
        graphics.lineTo(segment.end.x, segment.end.y);
        graphics.stroke({
          width: this.wireThickness,
          color,
          alpha: 1.0,
          cap: "square",
          join: "bevel",
        });
      }
    }

    // Draw connection dots at endpoints
    if (wire.segments.length > 0) {
      const firstSegment = wire.segments[0];
      const lastSegment = wire.segments[wire.segments.length - 1];

      graphics.circle(firstSegment.start.x, firstSegment.start.y, 3);
      graphics.fill(color);
      graphics.circle(lastSegment.end.x, lastSegment.end.y, 3);
      graphics.fill(color);
    }

    // Force graphics to be visible
    graphics.visible = true;
    graphics.alpha = 1.0;
  }

  /**
   * Update all visuals
   */
  private updateVisuals(): void {
    // Update wire visuals
    this.wires.forEach((wire) => {
      this.drawWire(wire);
    });

    // Update selection graphics (keep highlight in sync during drags)
    this.updateSelectionGraphics();
    this.updateJunctionGraphics();
  }

  /**
   * Move a full segment with the mouse (dragging whole sections)
   */
  private moveSegmentWithMouse(
    wire: InteractiveWireConnection,
    segmentIndex: number,
    mouseX: number,
    mouseY: number
  ): void {
    const segments = wire.segments;
    const seg = segments[segmentIndex];
    if (!seg) return;
    const EPS = 0.5;

    const isContiguous = (a: WireSegment, b: WireSegment) =>
      a.isHorizontal === b.isHorizontal &&
      Math.abs(a.end.x - b.start.x) <= EPS &&
      Math.abs(a.end.y - b.start.y) <= EPS;

    // Expand to full contiguous collinear run
    let runStart = segmentIndex;
    while (
      runStart - 1 >= 0 &&
      isContiguous(segments[runStart - 1], segments[runStart])
    ) {
      runStart--;
    }
    let runEnd = segmentIndex;
    while (
      runEnd + 1 < segments.length &&
      isContiguous(segments[runEnd], segments[runEnd + 1])
    ) {
      runEnd++;
    }

    if (seg.isHorizontal) {
      const y = Math.round(mouseY);
      // Move entire horizontal run
      for (let i = runStart; i <= runEnd; i++) {
        const s = segments[i];
        s.start = { ...s.start, y };
        s.end = { ...s.end, y };
      }
      // Update neighbors at both ends
      if (runStart - 1 >= 0) {
        const prev = segments[runStart - 1];
        prev.end = { ...prev.end, y };
      }
      if (runEnd + 1 < segments.length) {
        const next = segments[runEnd + 1];
        next.start = { ...next.start, y };
      }
      // Slide junction nodes that lie on this horizontal run
      const minX = Math.min(segments[runStart].start.x, segments[runEnd].end.x);
      const maxX = Math.max(segments[runStart].start.x, segments[runEnd].end.x);
      for (const node of wire.nodes) {
        if (
          node.type === "junction" &&
          node.x >= minX - 1 &&
          node.x <= maxX + 1
        ) {
          node.y = y;
          // Re-route any other wires that are connected to this junction
          for (const otherId of node.connectedWires || []) {
            if (otherId === wire.id) continue;
            const other = this.wires.get(otherId);
            if (!other) continue;
            // Other wire nodes: [component|junction, junction]
            const otherStart =
              other.nodes[0] === node ? other.nodes[1] : other.nodes[0];
            const startPos = {
              x: otherStart.x,
              y: otherStart.y,
              layer: 0,
            } as any;
            const endPos = { x: node.x, y: node.y, layer: 0 } as any;
            const routed = this.router.routeWire(startPos, endPos, []);
            other.segments = routed.segments;
            this.drawWire(other);
          }
        }
      }
    } else {
      const x = Math.round(mouseX);
      // Move entire vertical run
      for (let i = runStart; i <= runEnd; i++) {
        const s = segments[i];
        s.start = { ...s.start, x };
        s.end = { ...s.end, x };
      }
      // Update neighbors at both ends
      if (runStart - 1 >= 0) {
        const prev = segments[runStart - 1];
        prev.end = { ...prev.end, x };
      }
      if (runEnd + 1 < segments.length) {
        const next = segments[runEnd + 1];
        next.start = { ...next.start, x };
      }
      // Slide junction nodes that lie on this vertical run
      const minY = Math.min(segments[runStart].start.y, segments[runEnd].end.y);
      const maxY = Math.max(segments[runStart].start.y, segments[runEnd].end.y);
      for (const node of wire.nodes) {
        if (
          node.type === "junction" &&
          node.y >= minY - 1 &&
          node.y <= maxY + 1
        ) {
          node.x = x;
          for (const otherId of node.connectedWires || []) {
            if (otherId === wire.id) continue;
            const other = this.wires.get(otherId);
            if (!other) continue;
            const otherStart =
              other.nodes[0] === node ? other.nodes[1] : other.nodes[0];
            const startPos = {
              x: otherStart.x,
              y: otherStart.y,
              layer: 0,
            } as any;
            const endPos = { x: node.x, y: node.y, layer: 0 } as any;
            const routed = this.router.routeWire(startPos, endPos, []);
            other.segments = routed.segments;
            this.drawWire(other);
          }
        }
      }
    }

    // Ensure we keep a segment break at junctions before any merging
    this.ensureBreaksAtJunctions(wire);

    // Merge collinear segments after movement
    const merged: typeof segments = [];
    for (const s of segments) {
      const last = merged[merged.length - 1];
      const jointIsJunction = this.hasJunctionAtPoint(
        wire,
        s.start.x,
        s.start.y,
        2
      );
      if (
        last &&
        !jointIsJunction &&
        last.isHorizontal === s.isHorizontal &&
        Math.abs(last.end.x - s.start.x) <= EPS &&
        Math.abs(last.end.y - s.start.y) <= EPS
      ) {
        // Snap and merge
        s.start = { ...last.end } as any;
        last.end = { ...s.end };
      } else {
        // Snap start to previous end if very close
        if (
          last &&
          Math.abs(last.end.x - s.start.x) <= EPS &&
          Math.abs(last.end.y - s.start.y) <= EPS
        ) {
          s.start = { ...last.end } as any;
          if (s.isHorizontal) s.end.y = s.start.y;
          else s.end.x = s.start.x;
        }
        merged.push({ ...s });
      }
    }
    wire.segments = merged;

    // Ensure endpoints remain attached to their nodes by inserting short orthogonal leads if necessary
    this.ensureNodeAnchors(wire);
    this.drawWire(wire);
    this.updateSelectionGraphics();
  }

  /**
   * Ensure the first and last points remain attached to their component nodes.
   * If detachment occurs (due to segment moves), add orthogonal lead segments
   * from the node position to the first/last segment.
   */
  private ensureNodeAnchors(wire: InteractiveWireConnection): void {
    if (!wire.segments.length) return;

    const epsilon = 0.5;

    // Resolve node world positions (prefer live component locations)
    // Use first and last COMPONENT endpoints; ignore junctions in the middle
    const componentNodes = wire.nodes.filter(
      (n) => n && n.type === "component"
    );
    const startNode = componentNodes[0];
    const endNode = componentNodes[componentNodes.length - 1];

    const startPos = this.resolveNodeWorldPosition(startNode as any);
    const endPos = this.resolveNodeWorldPosition(endNode as any);

    // Ensure path direction corresponds to start->end nodes
    const firstSeg = wire.segments[0];
    const lastSeg = wire.segments[wire.segments.length - 1];
    const distStartToFirst = Math.hypot(
      firstSeg.start.x - startPos.x,
      firstSeg.start.y - startPos.y
    );
    const distStartToLast = Math.hypot(
      lastSeg.end.x - startPos.x,
      lastSeg.end.y - startPos.y
    );
    if (distStartToLast + 0.01 < distStartToFirst) {
      // Reverse path so it runs from startPos to endPos
      wire.segments.reverse();
      for (const s of wire.segments) {
        const tmp = { ...s.start };
        s.start = { ...s.end };
        s.end = tmp as any;
      }
    }

    // Start anchor: attach strictly to node with a perpendicular lead (not skewed)
    let first = wire.segments[0];
    if (first.isHorizontal) {
      if (
        Math.abs(first.start.x - startPos.x) > epsilon ||
        Math.abs(first.start.y - startPos.y) > epsilon
      ) {
        // Vertical lead from node to horizontal run y
        const leadEnd = { x: startPos.x, y: first.start.y, layer: 0 } as any;
        const lead: WireSegment = {
          start: { x: startPos.x, y: startPos.y, layer: 0 },
          end: { ...leadEnd },
          isHorizontal: false,
          layer: 0,
        };
        first.start = { ...leadEnd };
        wire.segments = [lead, ...wire.segments];
      }
    } else {
      if (
        Math.abs(first.start.x - startPos.x) > epsilon ||
        Math.abs(first.start.y - startPos.y) > epsilon
      ) {
        // Horizontal lead from node to vertical run x
        const leadEnd = { x: first.start.x, y: startPos.y, layer: 0 } as any;
        const lead: WireSegment = {
          start: { x: startPos.x, y: startPos.y, layer: 0 },
          end: { ...leadEnd },
          isHorizontal: true,
          layer: 0,
        };
        first.start = { ...leadEnd };
        wire.segments = [lead, ...wire.segments];
      }
    }
    // Align first segment axis exactly with its start
    first = wire.segments[0];
    if (first.isHorizontal) first.end.y = first.start.y;
    else first.end.x = first.start.x;

    // End anchor: attach strictly to node with a perpendicular lead
    let last = wire.segments[wire.segments.length - 1];
    if (last.isHorizontal) {
      if (
        Math.abs(last.end.x - endPos.x) > epsilon ||
        Math.abs(last.end.y - endPos.y) > epsilon
      ) {
        const leadStart = { x: endPos.x, y: last.end.y, layer: 0 } as any;
        const lead: WireSegment = {
          start: { ...leadStart },
          end: { x: endPos.x, y: endPos.y, layer: 0 },
          isHorizontal: false,
          layer: 0,
        };
        last.end = { ...leadStart };
        wire.segments = [...wire.segments, lead];
        last = wire.segments[wire.segments.length - 1];
      }
    } else {
      if (
        Math.abs(last.end.x - endPos.x) > epsilon ||
        Math.abs(last.end.y - endPos.y) > epsilon
      ) {
        const leadStart = { x: last.end.x, y: endPos.y, layer: 0 } as any;
        const lead: WireSegment = {
          start: { ...leadStart },
          end: { x: endPos.x, y: endPos.y, layer: 0 },
          isHorizontal: true,
          layer: 0,
        };
        last.end = { ...leadStart };
        wire.segments = [...wire.segments, lead];
        last = wire.segments[wire.segments.length - 1];
      }
    }
    // Align last segment axis exactly with its end
    last = wire.segments[wire.segments.length - 1];
    if (last.isHorizontal) last.start.y = last.end.y;
    else last.start.x = last.end.x;

    // Final merge of collinear neighbors, but keep explicit breaks at junctions
    const merged: typeof wire.segments = [];
    for (const s of wire.segments) {
      const prev = merged[merged.length - 1];
      const seamHasJunction = this.hasJunctionAtPoint(
        wire,
        s.start.x,
        s.start.y,
        2
      );
      if (
        prev &&
        !seamHasJunction &&
        prev.isHorizontal === s.isHorizontal &&
        prev.end.x === s.start.x &&
        prev.end.y === s.start.y
      ) {
        prev.end = { ...s.end };
      } else {
        merged.push({ ...s });
      }
    }
    wire.segments = merged;
    // Normalize to eliminate any residual skew or gaps
    this.normalizeWireSegments(wire);
  }

  /**
   * Normalize a wire's segments to be strictly orthogonal and perfectly contiguous
   */
  private normalizeWireSegments(wire: InteractiveWireConnection): void {
    const epsilon = 0.001;
    const round = (v: number) => Math.round(v);
    const normalized: WireSegment[] = [];

    for (let i = 0; i < wire.segments.length; i++) {
      const s0 = wire.segments[i];
      const s: WireSegment = {
        start: { x: round(s0.start.x), y: round(s0.start.y), layer: 0 },
        end: { x: round(s0.end.x), y: round(s0.end.y), layer: 0 },
        isHorizontal: s0.isHorizontal,
        layer: 0,
      };

      // Re-derive orientation and align
      const dx = Math.abs(s.end.x - s.start.x);
      const dy = Math.abs(s.end.y - s.start.y);
      if (dx >= dy) {
        s.isHorizontal = true;
        s.end.y = s.start.y;
      } else {
        s.isHorizontal = false;
        s.end.x = s.start.x;
      }

      // Force contiguity
      if (normalized.length) {
        s.start.x = normalized[normalized.length - 1].end.x;
        s.start.y = normalized[normalized.length - 1].end.y;
        if (s.isHorizontal) s.end.y = s.start.y;
        else s.end.x = s.start.x;
      }

      // Drop zero-length
      if (
        Math.abs(s.end.x - s.start.x) < epsilon &&
        Math.abs(s.end.y - s.start.y) < epsilon
      ) {
        continue;
      }

      // Merge collinear
      const prev = normalized[normalized.length - 1];
      if (
        prev &&
        prev.isHorizontal === s.isHorizontal &&
        prev.end.x === s.start.x &&
        prev.end.y === s.start.y
      ) {
        prev.end = { ...s.end } as any;
      } else {
        normalized.push(s);
      }
    }

    wire.segments = normalized;
  }

  private hasJunctionAtPoint(
    wire: InteractiveWireConnection,
    x: number,
    y: number,
    tol = 1
  ): boolean {
    for (const node of wire.nodes) {
      if (node.type === "junction") {
        if (Math.abs(node.x - x) <= tol && Math.abs(node.y - y) <= tol) {
          return true;
        }
      }
    }
    return false;
  }

  private ensureBreaksAtJunctions(wire: InteractiveWireConnection): void {
    const EPS = 0.5;
    const out: WireSegment[] = [];
    for (const seg of wire.segments) {
      const junctions = wire.nodes.filter((n) => n.type === "junction");
      const hits = junctions
        .filter((j) =>
          seg.isHorizontal
            ? j.y >= seg.start.y - EPS &&
              j.y <= seg.start.y + EPS &&
              j.x > Math.min(seg.start.x, seg.end.x) + EPS &&
              j.x < Math.max(seg.start.x, seg.end.x) - EPS
            : j.x >= seg.start.x - EPS &&
              j.x <= seg.start.x + EPS &&
              j.y > Math.min(seg.start.y, seg.end.y) + EPS &&
              j.y < Math.max(seg.start.y, seg.end.y) - EPS
        )
        .sort((a, b) => (seg.isHorizontal ? a.x - b.x : a.y - b.y));

      if (!hits.length) {
        out.push(seg);
        continue;
      }

      let cursor = { ...seg.start } as any;
      for (const j of hits) {
        const nextEnd = seg.isHorizontal
          ? { x: j.x, y: cursor.y, layer: 0 }
          : { x: cursor.x, y: j.y, layer: 0 };
        out.push({
          start: { ...cursor },
          end: { ...nextEnd },
          isHorizontal: seg.isHorizontal,
          layer: 0,
        });
        cursor = { ...nextEnd };
      }
      out.push({
        start: { ...cursor },
        end: { ...seg.end },
        isHorizontal: seg.isHorizontal,
        layer: 0,
      });
    }
    wire.segments = out;
  }

  private resolveNodeWorldPosition(node: WireNode | undefined): {
    x: number;
    y: number;
  } {
    if (!node) return { x: 0, y: 0 };
    if (node.componentId && node.nodeId) {
      const comp = this.components.get(node.componentId);
      if (comp) {
        const rp = this.getNodePosition(comp, node.nodeId);
        if (rp) return { x: rp.x, y: rp.y };
      }
    }
    return { x: node.x, y: node.y };
  }

  private createOrthogonalLead(
    from: { x: number; y: number },
    to: { x: number; y: number },
    preferAxis?: "horizontal" | "vertical"
  ): WireSegment[] {
    const lead: WireSegment[] = [];
    // Choose shorter L path
    const mid1 = { x: to.x, y: from.y };
    const mid2 = { x: from.x, y: to.y };
    const path1 =
      Math.hypot(mid1.x - from.x, mid1.y - from.y) +
      Math.hypot(to.x - mid1.x, to.y - mid1.y);
    const path2 =
      Math.hypot(mid2.x - from.x, mid2.y - from.y) +
      Math.hypot(to.x - mid2.x, to.y - mid2.y);
    let useMid = path1 <= path2 ? mid1 : mid2;
    if (preferAxis === "horizontal") useMid = mid1; // go horizontal first
    if (preferAxis === "vertical") useMid = mid2; // go vertical first
    // Segment 1
    lead.push({
      start: { x: from.x, y: from.y, layer: 0 },
      end: { x: useMid.x, y: useMid.y, layer: 0 },
      isHorizontal: Math.abs(useMid.x - from.x) >= Math.abs(useMid.y - from.y),
      layer: 0,
    });
    // Segment 2
    lead.push({
      start: { x: useMid.x, y: useMid.y, layer: 0 },
      end: { x: to.x, y: to.y, layer: 0 },
      isHorizontal: Math.abs(to.x - useMid.x) >= Math.abs(to.y - useMid.y),
      layer: 0,
    });
    return lead;
  }

  /**
   * Update selection graphics
   */
  private updateSelectionGraphics(): void {
    this.selectionGraphics.clear();

    if (this.interactionState.selectedWire) {
      const wire = this.wires.get(this.interactionState.selectedWire);
      if (wire) {
        // Highlight selected wire by stroking each segment; this is cheap and syncs per-frame
        for (const segment of wire.segments) {
          this.selectionGraphics.moveTo(segment.start.x, segment.start.y);
          this.selectionGraphics.lineTo(segment.end.x, segment.end.y);
        }
        this.selectionGraphics.stroke({
          width: this.wireThickness + 2,
          color: this.selectedWireColor,
          alpha: 0.35,
          cap: "square",
          join: "bevel",
        });
      }
    }
  }

  /**
   * Update junction graphics
   */
  private updateJunctionGraphics(): void {
    this.junctionGraphics.clear();

    // Draw all junction nodes
    this.nodes.forEach((node) => {
      if (node.type === "junction") {
        this.junctionGraphics.circle(node.x, node.y, 4);
        this.junctionGraphics.fill(this.junctionColor);
        this.junctionGraphics.circle(node.x, node.y, 6);
        this.junctionGraphics.stroke({ width: 2, color: this.junctionColor });
      }
    });
  }

  /**
   * Get wire container
   */
  public getContainer(): Container {
    return this.wireContainer;
  }

  /**
   * Add component to the system
   */
  public addComponent(component: CircuitComponent): void {
    console.log(
      `🔌 Adding component to InteractiveWireSystem: ${component.getName()}`
    );
    this.components.set(component.getName(), component);
    this.router.addComponent(component);
    this.hybridRouter.addComponent(component);
    console.log(
      `✅ Component ${component.getName()} added. Total components: ${this.components.size}`
    );
  }

  /**
   * Remove component from the system
   */
  public removeComponent(componentId: string): void {
    this.components.delete(componentId);
    this.router.removeComponent(componentId);
    this.hybridRouter.removeComponent(componentId);

    // Remove any wires connected to this component
    const wiresToRemove: string[] = [];
    this.wires.forEach((wire, wireId) => {
      if (wire.nodes.some((node) => node.componentId === componentId)) {
        wiresToRemove.push(wireId);
      }
    });

    // Remove wires and notify solver about disconnections
    wiresToRemove.forEach((wireId) => {
      const wire = this.wires.get(wireId);
      if (wire) {
        const endpoints = wire.nodes.filter((n) => n.type === "component");
        if (endpoints.length === 2) {
          try {
            (window as any).dispatchEvent?.(
              new CustomEvent("wire:disconnected", {
                detail: {
                  a: {
                    componentId: endpoints[0].componentId,
                    nodeId: endpoints[0].nodeId,
                  },
                  b: {
                    componentId: endpoints[1].componentId,
                    nodeId: endpoints[1].nodeId,
                  },
                  wireId,
                },
              })
            );
          } catch (err) {
            console.warn(
              "⚠️ Failed to notify solver about component wire removal:",
              err
            );
          }
        }
      }
      this.removeWire(wireId);
    });
  }

  /**
   * Get all wires
   */
  public getWires(): Map<string, InteractiveWireConnection> {
    return this.wires;
  }

  /**
   * Get all nodes
   */
  public getNodes(): Map<string, WireNode> {
    return this.nodes;
  }

  /**
   * Clear all wires
   */
  public clearWires(): void {
    this.wires.forEach((wire) => {
      this.wireContainer.removeChild(wire.graphics);
      wire.graphics.destroy();
    });
    this.wires.clear();
    this.nodes.clear();
  }

  /**
   * Delete selected wire
   */
  public deleteSelectedWire(): boolean {
    if (!this.interactionState.selectedWire) return false;

    const wireId = this.interactionState.selectedWire;
    const wire = this.wires.get(wireId);
    if (!wire) return false;

    // Remove from container
    if (wire.graphics.parent) {
      wire.graphics.parent.removeChild(wire.graphics);
    }

    // Clean up nodes
    for (const node of wire.nodes) {
      this.nodes.delete(node.id);
    }

    this.wires.delete(wireId);
    this.interactionState.selectedWire = null;
    this.updateSelectionGraphics();

    // Also dispatch disconnect event for solver clean-up
    try {
      const endpoints = wire.nodes.filter((n) => n.type === "component");
      if (endpoints.length === 2) {
        (window as any).dispatchEvent?.(
          new CustomEvent("wire:disconnected", {
            detail: {
              a: {
                componentId: endpoints[0].componentId,
                nodeId: endpoints[0].nodeId,
              },
              b: {
                componentId: endpoints[1].componentId,
                nodeId: endpoints[1].nodeId,
              },
              wireId,
            },
          })
        );
      }
    } catch {}

    return true;
  }

  /**
   * Get wire at point for selection
   */
  public getWireAtPoint(
    x: number,
    y: number
  ): InteractiveWireConnection | null {
    for (const wire of this.wires.values()) {
      for (const segment of wire.segments) {
        if (this.isPointOnWireSegment(x, y, segment)) {
          return wire;
        }
      }
    }
    return null;
  }

  /**
   * Check if point is on wire segment
   */
  private isPointOnWireSegment(
    x: number,
    y: number,
    segment: WireSegment
  ): boolean {
    const threshold = 10; // Click tolerance

    if (segment.isHorizontal) {
      const minX = Math.min(segment.start.x, segment.end.x);
      const maxX = Math.max(segment.start.x, segment.end.x);
      const wireY = segment.start.y;

      return (
        x >= minX - threshold &&
        x <= maxX + threshold &&
        Math.abs(y - wireY) <= threshold
      );
    } else {
      const minY = Math.min(segment.start.y, segment.end.y);
      const maxY = Math.max(segment.start.y, segment.end.y);
      const wireX = segment.start.x;

      return (
        y >= minY - threshold &&
        y <= maxY + threshold &&
        Math.abs(x - wireX) <= threshold
      );
    }
  }

  /**
   * Select wire at point
   */
  public selectWireAtPoint(x: number, y: number): boolean {
    const wire = this.getWireAtPoint(x, y);
    if (wire) {
      this.interactionState.selectedWire = wire.id;
      this.updateSelectionGraphics();
      return true;
    }
    return false;
  }

  /**
   * Set the wire routing strategy
   */
  public setRoutingStrategy(strategy: "orthogonal" | "astar" | "hybrid"): void {
    this.hybridRouter.setRoutingStrategy(strategy);
    console.log(`🔄 Wire routing strategy set to: ${strategy}`);
  }

  /**
   * Get routing statistics
   */
  public getRoutingStats(): any {
    return this.hybridRouter.getRoutingStats();
  }

  /**
   * Test the open-source routing algorithms
   */
  public testOpenSourceRouting(): void {
    console.log(
      "🧪 Testing Open-Source Wire Routing in InteractiveWireSystem..."
    );

    const start: RoutingPoint = { x: 100, y: 100, layer: 0 };
    const end: RoutingPoint = { x: 300, y: 200, layer: 0 };

    // Test all strategies
    const strategies: ("orthogonal" | "astar" | "hybrid")[] = [
      "orthogonal",
      "astar",
      "hybrid",
    ];

    strategies.forEach((strategy) => {
      this.hybridRouter.setRoutingStrategy(strategy);
      const path = this.hybridRouter.routeWire(start, end);

      console.log(`📊 ${strategy.toUpperCase()} Results:`);
      console.log(`   - Segments: ${path.segments.length}`);
      console.log(`   - Length: ${path.totalLength.toFixed(2)}px`);
      console.log(`   - Bends: ${path.bendCount}`);
    });

    console.log("\n🎉 Open-Source Routing Test Complete!");
  }

  /**
   * Destroy the system
   */
  public destroy(): void {
    this.clearWires();
    this.wireContainer.destroy();
    this.router.clearCache();
    this.hybridRouter.clear();
  }

  /**
   * Find the closest segment to a point
   */
  private getClosestSegmentIndex(
    wire: InteractiveWireConnection,
    point: Point
  ): number {
    let closestSegment = -1;
    let minDistance = Infinity;

    for (let i = 0; i < wire.segments.length; i++) {
      const segment = wire.segments[i];
      const distance = this.distanceToLineSegment(
        point,
        { x: segment.start.x, y: segment.start.y },
        { x: segment.end.x, y: segment.end.y }
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestSegment = i;
      }
    }

    return closestSegment;
  }

  /**
   * Convert from global/screen coordinates to the local coordinates of the wire container
   */
  private toWireLocalPoint(point: Point): { x: number; y: number } {
    const p = (this.wireContainer as any).toLocal(point as any);
    return { x: p.x, y: p.y } as any;
  }
}
