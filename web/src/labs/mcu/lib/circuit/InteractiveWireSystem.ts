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
import { DesignTokens } from "./rendering/DesignTokens";
import {
  OptimizedWireRouter,
  RoutingPoint,
  WirePath,
} from "./OptimizedWireRouter";
import { HybridWireRouter } from "./HybridWireRouter";
import { GridCanvas } from "./GridCanvas";
import { WireRouterFacade } from "./wire/editor/WireRouterFacade";
import {
  finalizeOrthogonalWireSegments,
  mergeCollinearOrthoSegments,
  wirePathCost,
} from "./wire/editor/RouteNormalizer";
import { splitSegmentAtPoint } from "./wire/editor/splitWireSegment";
import {
  drawRoundedOrthoWire,
  drawWireHitPath,
  schematicHitStrokeWidth,
  schematicCornerRadius,
} from "./wire/editor/SchematicWireRenderer";
import {
  assignStableSegmentIds,
  buildAnimationPathMeta,
  type WireAnimationPathMeta,
} from "./wire/editor/wirePathAnimationCache";
import { SnapEngine } from "./wire/editor/SnapEngine";
import { WireInteractionController } from "./wire/editor/WireInteractionController";
import { WireGraph } from "./wire/editor/WireGraph";
import type { SnapCandidate, HoverTarget } from "./wire/editor/SchematicWireTypes";
import {
  computeSchematicRoute,
  straightExcludeForEndpointNodes,
} from "./wire/editor/SchematicRouteComputer";

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
  /** Wide invisible pick path drawn under `graphics` (stroke layer). */
  hitGraphics?: Graphics;
  isSelected: boolean;
  isDragging: boolean;
  dragPoint?: { x: number; y: number };
  current: number;
  voltage: number;
  cachedRoutes: Map<string, WirePath>; // Cache for different routing options
  /** Stable ids per segment for animation / edit bookkeeping */
  segmentStableIds?: string[];
  routeRevision?: number;
  animationPathMeta?: WireAnimationPathMeta;
}

export interface WireSegment {
  start: RoutingPoint;
  end: RoutingPoint;
  isHorizontal: boolean;
  layer: number;
}

/** Component terminal used for schematic escape stubs (pin → routing anchor). */
export type SchematicEndpointPinRef = {
  componentId: string;
  nodeId: string;
};

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

export type InteractiveWireSystemOptions = {
  /** After create/remove/join/tap — rebuild solver connectivity from `nodes` graph. */
  onTopologyChanged?: () => void;
};

/**
 * Interactive wire system with advanced editing capabilities
 */
export class InteractiveWireSystem {
  private router: OptimizedWireRouter;
  private hybridRouter: HybridWireRouter;
  private wireRouter: WireRouterFacade;
  private wires: Map<string, InteractiveWireConnection>;
  private wireContainer: Container;
  private gridCanvas: GridCanvas;
  private components: Map<string, CircuitComponent>;
  private nodes: Map<string, WireNode>;
  private nextNodeId: number = 0;
  private gridCellSize: number;
  private readonly onTopologyChanged?: () => void;
  private wireGraphView = new WireGraph();
  private snapEngine = new SnapEngine();
  private wireEditFsm = new WireInteractionController();
  private componentRerouteTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly componentRerouteDebounceMs = 65;
  /** Polyline token → refresh segment ids / animation meta only when geometry changes. */
  private wireGeometryTokens = new Map<string, string>();
  /** Orthogonal rubber-band preview while rerouting (not endpoint/s segment drag). */
  private reroutePreviewGraphics!: Graphics;

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

  constructor(
    gridCanvas: GridCanvas,
    options?: InteractiveWireSystemOptions,
  ) {
    this.gridCanvas = gridCanvas;
    this.onTopologyChanged = options?.onTopologyChanged;
    this.wires = new Map();
    this.wireContainer = new Container();
    this.components = new Map();
    this.nodes = new Map();

    // Start continuous update loop for wire position updates
    // this.startUpdateLoop(); // DISABLED - causing continuous getNodePosition calls

    // Initialize router — cell size must match GridCanvas spacing used for gridDims
    // (worldToGrid = world / cellSize). A mismatch collapses A* into bogus "direct" diagonals.
    const gridDims = gridCanvas.getGridDimensions();
    this.gridCellSize = gridCanvas.getSettings().size;
    console.log(
      `🔍 Grid dimensions: width=${gridDims.width}, height=${gridDims.height}`
    );
    this.router = new OptimizedWireRouter(
      gridDims.width,
      gridDims.height,
      this.gridCellSize,
      {
      preferOrthogonal: true,
      minimizeBends: true,
      avoidComponents: true,
      enablePostProcessing: true,
      mergeCollinearSegments: true,
      enableCaching: true,
      maxSearchIterations: 8000,
      },
    );

    // Initialize hybrid router with open-source algorithms
    this.hybridRouter = new HybridWireRouter(
      gridDims.width,
      gridDims.height,
      this.gridCellSize,
    );
    this.wireRouter = new WireRouterFacade(this.router, this.hybridRouter, {
      gridCellSize: this.gridCellSize,
      maxCostIncreaseRatio: 1.15,
    });
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

    this.reroutePreviewGraphics = new Graphics();
    this.wireContainer.addChild(this.reroutePreviewGraphics);

    this.setupEventListeners();
  }

  private notifyTopologyChanged(): void {
    try {
      this.onTopologyChanged?.();
    } catch (e) {
      console.warn("InteractiveWireSystem onTopologyChanged failed:", e);
    }
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
          const op = this.interactionState.dragOperation;
          this.wireEditFsm.beginSession(
            op === "segment"
              ? "movingWholeSegment"
              : op === "endpoint_start" || op === "endpoint_end"
                ? "movingEndpoint"
                : "draggingFromWire"
          );
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

        // Preview new route (same solver + obstacles as committed wires)
        const avoid = this.collectWireAvoidComponentIds(wire);
        const g = this.gridCellSize;
        const snap = (x: number, y: number) => ({
          x: Math.round(x / g) * g,
          y: Math.round(y / g) * g,
        });
        if ((wire.dragPoint as any).__endpoint === "start") {
          const sn = snap(event.global.x, event.global.y);
          const newStart: RoutingPoint = { x: sn.x, y: sn.y, layer: 0 };
          const end = wire.segments[wire.segments.length - 1].end;
          const preview = this.routeWireWithBends(newStart, end, avoid);
          wire.segments = preview.segments;
          wire.segments[wire.segments.length - 1].end = { ...end };
          this.drawWire(wire);
          this.updateSelectionGraphics();
          this.updateJunctionGraphics();
        } else if ((wire.dragPoint as any).__endpoint === "end") {
          const start = wire.segments[0].start;
          const sn = snap(event.global.x, event.global.y);
          const newEnd: RoutingPoint = { x: sn.x, y: sn.y, layer: 0 };
          const preview = this.routeWireWithBends(start, newEnd, avoid);
          wire.segments = preview.segments;
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
            this.reroutePreviewGraphics.clear();
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
    this.wireEditFsm.transition("idle");
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
    const threshold = Math.max(8, schematicHitStrokeWidth() * 0.45);

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

  private snapWorldFromTarget(t: HoverTarget): { x: number; y: number } {
    if (t.kind === "empty") return t.world;
    return t.snap;
  }

  private projectPointToOrthoSegment(
    point: Point,
    segment: WireSegment
  ): { x: number; y: number } {
    if (segment.isHorizontal) {
      const minX = Math.min(segment.start.x, segment.end.x);
      const maxX = Math.max(segment.start.x, segment.end.x);
      const x = Math.max(minX, Math.min(point.x, maxX));
      return { x, y: segment.start.y };
    }
    const minY = Math.min(segment.start.y, segment.end.y);
    const maxY = Math.max(segment.start.y, segment.end.y);
    const y = Math.max(minY, Math.min(point.y, maxY));
    return { x: segment.start.x, y };
  }

  private buildSnapCandidates(point: Point): SnapCandidate[] {
    const out: SnapCandidate[] = [];
    const sel = this.interactionState.selectedWire;

    for (const c of this.components.values()) {
      const cid = c.getName();
      for (const n of c.getNodes()) {
        const p = this.getNodePosition(c, n.id);
        if (!p) continue;
        const d = Math.hypot(p.x - point.x, p.y - point.y);
        if (d < 48) {
          out.push({
            target: {
              kind: "pin",
              pinId: `${cid}:${n.id}`,
              snap: { x: p.x, y: p.y },
            },
            priority: 0,
            distPx: d,
          });
        }
      }
    }

    for (const j of this.nodes.values()) {
      if (j.type !== "junction") continue;
      const d = Math.hypot(j.x - point.x, j.y - point.y);
      if (d < 48) {
        out.push({
          target: {
            kind: "junction",
            junctionId: j.id,
            snap: { x: j.x, y: j.y },
          },
          priority: 1,
          distPx: d,
        });
      }
    }

    for (const w of this.wires.values()) {
      if (w.id === sel) continue;
      for (let si = 0; si < w.segments.length; si++) {
        const seg = w.segments[si]!;
        const proj = this.projectPointToOrthoSegment(point, seg);
        const d = Math.hypot(proj.x - point.x, proj.y - point.y);
        if (d < 28) {
          const sid = w.segmentStableIds?.[si] ?? `${w.id}:seg${si}:legacy`;
          out.push({
            target: {
              kind: "segment",
              wireId: w.id,
              segmentId: sid,
              t: 0,
              snap: proj,
            },
            priority: 2,
            distPx: d,
          });
        }
      }
    }

    out.push({
      target: { kind: "empty", world: { x: point.x, y: point.y } },
      priority: 9,
      distPx: 0,
    });
    return out;
  }

  /**
   * Show snap indicators for wire joining (tiered targets + hysteresis).
   */
  private showSnapIndicators(point: Point): void {
    this.snapGraphics.clear();
    const resolved = this.snapEngine.resolve(this.buildSnapCandidates(point));
    if (!resolved || resolved.target.kind === "empty") return;
    const s = this.snapWorldFromTarget(resolved.target);
    this.snapGraphics.circle(s.x, s.y, 7);
    this.snapGraphics.stroke({ width: 2, color: this.snapColor, alpha: 0.9 });
    this.snapGraphics.circle(s.x, s.y, 3);
    this.snapGraphics.fill({ color: this.snapColor, alpha: 0.35 });
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
    this.snapEngine.reset();
    this.reroutePreviewGraphics.clear();
  }

  /**
   * Preview wire rerouting
   */
  private previewReroute(wire: InteractiveWireConnection, point: Point): void {
    const start = wire.segments[0]?.start;
    const end = wire.segments[wire.segments.length - 1]?.end;
    if (!start || !end) return;

    const g = this.gridCellSize;
    const through = {
      x: Math.round(point.x / g) * g,
      y: Math.round(point.y / g) * g,
    };
    const avoid = this.collectWireAvoidComponentIds(wire);
    const s0: RoutingPoint = { x: start.x, y: start.y, layer: 0 };
    const t: RoutingPoint = { x: through.x, y: through.y, layer: 0 };
    const e0: RoutingPoint = { x: end.x, y: end.y, layer: 0 };
    const headN = wire.nodes[0];
    const tailN = wire.nodes[wire.nodes.length - 1];
    const leg1p = this.routeSchematicPath(s0, t, avoid, {
      straightExcludeComponentIds: straightExcludeForEndpointNodes(headN),
      endpointPins: {
        start:
          headN.type === "component" &&
          headN.componentId &&
          headN.nodeId
            ? { componentId: headN.componentId, nodeId: headN.nodeId }
            : undefined,
      },
    });
    const leg2p = this.routeSchematicPath(t, e0, avoid, {
      straightExcludeComponentIds: straightExcludeForEndpointNodes(tailN),
      endpointPins: {
        end:
          tailN.type === "component" &&
          tailN.componentId &&
          tailN.nodeId
            ? { componentId: tailN.componentId, nodeId: tailN.nodeId }
            : undefined,
      },
    });
    const merged = this.finalizeWireSegments([
      ...leg1p.segments,
      ...leg2p.segments.slice(1),
    ]);
    const pts = this.segmentsToPolylinePoints(merged);
    if (pts.length < 2) return;

    this.reroutePreviewGraphics.clear();
    this.reroutePreviewGraphics.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      this.reroutePreviewGraphics.lineTo(pts[i].x, pts[i].y);
    }
    this.reroutePreviewGraphics.stroke({
      width: 2,
      color: this.selectedWireColor,
      alpha: 0.75,
    });
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
   * If (x,y) is already a junction on one of these wires, reuse it so the solver sees one net.
   */
  private findJunctionNearPointOnWires(
    x: number,
    y: number,
    nearbyWires: InteractiveWireConnection[],
    tol: number,
  ): WireNode | null {
    const tol2 = tol * tol;
    let best: WireNode | null = null;
    let bestD = tol2 + 1;
    for (const w of nearbyWires) {
      for (const n of w.nodes) {
        if (n.type !== "junction") continue;
        const d = (n.x - x) ** 2 + (n.y - y) ** 2;
        if (d <= tol2 && d < bestD) {
          bestD = d;
          best = n;
        }
      }
    }
    return best;
  }

  /** True if (x,y) lies on the orthogonal polyline within tolerance (for join snap-invariant). */
  private pointNearWirePolyline(
    wire: InteractiveWireConnection,
    x: number,
    y: number,
    tol: number,
  ): boolean {
    for (const seg of wire.segments) {
      const x1 = seg.start.x;
      const y1 = seg.start.y;
      const x2 = seg.end.x;
      const y2 = seg.end.y;
      if (seg.isHorizontal) {
        if (Math.abs(y - y1) > tol) continue;
        const lo = Math.min(x1, x2) - tol;
        const hi = Math.max(x1, x2) + tol;
        if (x >= lo && x <= hi) return true;
      } else {
        if (Math.abs(x - x1) > tol) continue;
        const lo = Math.min(y1, y2) - tol;
        const hi = Math.max(y1, y2) + tol;
        if (y >= lo && y <= hi) return true;
      }
    }
    return false;
  }

  /**
   * Reorder `wire.nodes` for T-junction / tap topology without changing geometry.
   */
  private reorderJunctionWireNodes(
    wire: InteractiveWireConnection,
    junction: WireNode,
  ): void {
    const comps = wire.nodes.filter((n) => n.type === "component");
    const juncs = wire.nodes.filter((n) => n.type === "junction");

    if (comps.length === 2) {
      if (juncs.length === 1) {
        wire.nodes = this.orderTwoComponentsAndJunctionAlongWire(
          wire,
          comps[0]!,
          comps[1]!,
          juncs[0]!,
        );
      } else if (juncs.length > 1) {
        wire.nodes = this.sortWireNodesByArcLength(wire, [...comps, ...juncs]);
      } else {
        wire.nodes = [comps[0]!, junction, comps[1]!];
      }
    } else if (comps.length === 1 && juncs.length >= 1) {
      wire.nodes = this.sortWireNodesByArcLength(wire, [...comps, ...juncs]);
    } else if (comps.length >= 2) {
      wire.nodes = [comps[0]!, junction, comps[comps.length - 1]!];
    } else {
      const first = wire.nodes[0];
      const last = wire.nodes[wire.nodes.length - 1];
      if (first && last) {
        wire.nodes = [first, junction, last];
      }
    }
  }

  /**
   * After a join: fix node order and only re-run the router if the junction is not already on the path.
   */
  private mergeJoinedWireGeometry(
    wire: InteractiveWireConnection,
    junction: WireNode,
  ): void {
    this.reorderJunctionWireNodes(wire, junction);
    const weldTol = Math.max(4, this.gridCellSize * 0.25);
    const alreadyOnPath =
      wire.segments.length > 0 &&
      this.pointNearWirePolyline(wire, junction.x, junction.y, weldTol);
    if (!alreadyOnPath) {
      this.reroutePolylineThroughOrderedNodes(wire);
    }
    this.ensureBreaksAtJunctions(wire);
    this.syncHostWireGeometryAfterTapSplit(wire);
    this.ensureNodeAnchors(wire);
    this.refreshWireDerivedState(wire);
    this.drawWire(wire);
  }

  /**
   * Join two wires at a specific point
   */
  private joinWires(
    wire1: InteractiveWireConnection,
    wire2: InteractiveWireConnection,
    joinPoint: Point
  ): void {
    // `wire2` is the host net segment we're tapping (stationary); snap the junction onto
    // its orthogonal polyline and split in-place — same model as KiCad/Falstad tap-on-wire.
    const snap = this.getNearestPointOnWire(wire2, joinPoint);
    const joinReuseTol = Math.max(5, this.gridCellSize * 0.45);
    const reusable = this.findJunctionNearPointOnWires(
      snap.x,
      snap.y,
      [wire1, wire2],
      joinReuseTol,
    );

    if (reusable) {
      if (!reusable.connectedWires.includes(wire1.id)) {
        reusable.connectedWires.push(wire1.id);
      }
      if (!reusable.connectedWires.includes(wire2.id)) {
        reusable.connectedWires.push(wire2.id);
      }
      if (!wire1.nodes.some((n) => n === reusable)) {
        wire1.nodes.push(reusable);
      }
      if (!wire2.nodes.some((n) => n === reusable)) {
        wire2.nodes.push(reusable);
      }
      this.mergeJoinedWireGeometry(wire1, reusable);
      this.mergeJoinedWireGeometry(wire2, reusable);
      this.updateJunctionGraphics();
      this.notifyTopologyChanged();
      console.log(
        `🔗 Joined wires ${wire1.id} and ${wire2.id} reusing junction ${reusable.id}`,
      );
      return;
    }

    const junctionId = `junction_${this.nextNodeId++}`;
    const junction: WireNode = {
      id: junctionId,
      x: snap.x,
      y: snap.y,
      type: "junction",
      connectedWires: [wire1.id, wire2.id],
    };
    this.nodes.set(junctionId, junction);

    const segIdx = this.getClosestSegmentIndex(wire2, snap);
    const split =
      segIdx >= 0
        ? splitSegmentAtPoint(
            wire2.segments,
            segIdx,
            snap,
            this.gridCellSize,
          )
        : null;

    if (split) {
      wire2.segments = split.replacement;
      junction.x = split.junctionWorld.x;
      junction.y = split.junctionWorld.y;
      this.setWireNodesTwoComponentWithJunction(wire2, junction);
      this.ensureBreaksAtJunctions(wire2);
      this.syncHostWireGeometryAfterTapSplit(wire2);
      this.refreshWireDerivedState(wire2);
      this.drawWire(wire2);
    } else {
      wire2.nodes.push(junction);
      this.mergeJoinedWireGeometry(wire2, junction);
    }

    wire1.nodes.push(junction);
    this.mergeJoinedWireGeometry(wire1, junction);

    this.updateJunctionGraphics();
    this.notifyTopologyChanged();
    console.log(
      `🔗 Joined wires ${wire1.id} and ${wire2.id} at junction ${junctionId}`,
    );
  }

  /**
   * Reroute wire through a junction (full schematic re-route).
   */
  private rerouteWireThroughJunction(
    wire: InteractiveWireConnection,
    junction: WireNode
  ): void {
    this.reorderJunctionWireNodes(wire, junction);
    this.reroutePolylineThroughOrderedNodes(wire);
  }

  /**
   * Arc length along current wire polyline to the closest point to (wx, wy).
   */
  private arcLengthAlongWireToPoint(
    wire: InteractiveWireConnection,
    wx: number,
    wy: number
  ): number {
    const pts = this.segmentsToPolylinePoints(wire.segments);
    if (pts.length < 2) return 0;
    let bestS = 0;
    let bestD = Infinity;
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i]!.x;
      const ay = pts[i]!.y;
      const bx = pts[i + 1]!.x;
      const by = pts[i + 1]!.y;
      const dx = bx - ax;
      const dy = by - ay;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 1e-6) continue;
      const t = Math.max(
        0,
        Math.min(1, ((wx - ax) * dx + (wy - ay) * dy) / (segLen * segLen)),
      );
      const px = ax + t * dx;
      const py = ay + t * dy;
      const d = Math.hypot(wx - px, wy - py);
      if (d < bestD) {
        bestD = d;
        bestS = acc + t * segLen;
      }
      acc += segLen;
    }
    return bestS;
  }

  private sortWireNodesByArcLength(
    wire: InteractiveWireConnection,
    nodes: WireNode[]
  ): WireNode[] {
    return [...nodes].sort(
      (a, b) =>
        this.arcLengthAlongWireToPoint(wire, a.x, a.y) -
        this.arcLengthAlongWireToPoint(wire, b.x, b.y),
    );
  }

  /**
   * Order [A, junction, B] using path direction: component nearer to polyline start is first.
   */
  private orderTwoComponentsAndJunctionAlongWire(
    wire: InteractiveWireConnection,
    a: WireNode,
    b: WireNode,
    j: WireNode
  ): WireNode[] {
    if (!wire.segments.length) return [a, j, b];
    const head = wire.segments[0]!.start;
    const da = Math.hypot(a.x - head.x, a.y - head.y);
    const db = Math.hypot(b.x - head.x, b.y - head.y);
    const [first, second] = da <= db ? [a, b] : [b, a];
    return [first, j, second];
  }

  private setWireNodesTwoComponentWithJunction(
    wire: InteractiveWireConnection,
    junction: WireNode
  ): void {
    const comps = wire.nodes.filter((n) => n.type === "component");
    if (comps.length >= 2) {
      wire.nodes = this.orderTwoComponentsAndJunctionAlongWire(
        wire,
        comps[0]!,
        comps[1]!,
        junction,
      );
      return;
    }
    wire.nodes = [...comps, junction];
  }

  /**
   * After an in-place split at a T-tap, `ensureNodeAnchors` + `normalizeWireSegments` can
   * reverse the polyline, re-classify nearly-axis segments, or snap pins in ways that shorten
   * the collinear trunk and leave a visible gap at the junction.
   * Keep the split geometry and only weld junction coordinates + segment joints.
   */
  private syncHostWireGeometryAfterTapSplit(wire: InteractiveWireConnection): void {
    const TOL = 4;
    const juncs = wire.nodes.filter((n) => n.type === "junction");
    for (const j of juncs) {
      for (const s of wire.segments) {
        if (
          Math.abs(s.start.x - j.x) <= TOL &&
          Math.abs(s.start.y - j.y) <= TOL
        ) {
          s.start.x = j.x;
          s.start.y = j.y;
        }
        if (
          Math.abs(s.end.x - j.x) <= TOL &&
          Math.abs(s.end.y - j.y) <= TOL
        ) {
          s.end.x = j.x;
          s.end.y = j.y;
        }
      }
    }
    for (let i = 1; i < wire.segments.length; i++) {
      const prev = wire.segments[i - 1]!;
      const cur = wire.segments[i]!;
      cur.start.x = prev.end.x;
      cur.start.y = prev.end.y;
      if (cur.isHorizontal) {
        cur.end.y = cur.start.y;
      } else {
        cur.end.x = cur.start.x;
      }
    }
  }

  /**
   * Re-run schematic routing for a short branch that terminates on a junction (e.g. after sliding a segment).
   */
  private rerouteBranchToJunctionSchematic(
    branchWire: InteractiveWireConnection,
    fixedEndpoint: WireNode,
    junction: WireNode
  ): void {
    const avoid = this.collectWireAvoidComponentIds(branchWire);
    const startPos: RoutingPoint = {
      x: fixedEndpoint.x,
      y: fixedEndpoint.y,
      layer: 0,
    };
    const endPos: RoutingPoint = {
      x: junction.x,
      y: junction.y,
      layer: 0,
    };
    const path = this.routeSchematicPath(startPos, endPos, avoid, {
      straightExcludeComponentIds:
        straightExcludeForEndpointNodes(fixedEndpoint),
      endpointPins:
        fixedEndpoint.type === "component" &&
        fixedEndpoint.componentId &&
        fixedEndpoint.nodeId
          ? {
              start: {
                componentId: fixedEndpoint.componentId,
                nodeId: fixedEndpoint.nodeId,
              },
            }
          : undefined,
    });
    branchWire.segments = path.segments;
  }

  /** Full reroute for wires with ordered component/junction nodes. */
  private reroutePolylineThroughOrderedNodes(
    wire: InteractiveWireConnection
  ): void {
    const ordered = wire.nodes;
    if (ordered.length < 2) return;

    const avoid = new Set<string>();
    for (const n of ordered) {
      if (n.type === "component" && n.componentId) avoid.add(n.componentId);
    }
    const avoidList = [...avoid];

    let allSegs: WireSegment[] = [];
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i]!;
      const b = ordered[i + 1]!;
      const legPath = this.routeSchematicPath(
        { x: a.x, y: a.y, layer: 0 },
        { x: b.x, y: b.y, layer: 0 },
        avoidList,
        {
          straightExcludeComponentIds:
            straightExcludeForEndpointNodes(a, b),
          endpointPins: this.endpointPinOptionsForWireNodes(a, b),
        },
      );
      if (i === 0) allSegs = allSegs.concat(legPath.segments);
      else allSegs = allSegs.concat(legPath.segments.slice(1));
    }
    wire.segments = this.finalizeWireSegments(allSegs);
    this.ensureNodeAnchors(wire);
    this.drawWire(wire);
    this.updateSelectionGraphics();
  }

  private wireGeometryToken(wire: InteractiveWireConnection): string {
    if (wire.segments.length === 0) return "";
    return wire.segments
      .map(
        (s) =>
          `${s.start.x.toFixed(2)},${s.start.y.toFixed(2)}->${s.end.x.toFixed(2)},${s.end.y.toFixed(2)}`
      )
      .join("|");
  }

  private refreshWireDerivedState(wire: InteractiveWireConnection): void {
    const prevIds = wire.segmentStableIds;
    const topologyChanged =
      !prevIds || prevIds.length !== wire.segments.length;
    const revision = topologyChanged
      ? (wire.routeRevision ?? 0) + 1
      : (wire.routeRevision ?? 0);
    wire.routeRevision = revision;
    wire.segmentStableIds = assignStableSegmentIds(
      wire.id,
      wire.segments,
      topologyChanged ? undefined : prevIds,
      revision
    );
    wire.animationPathMeta = buildAnimationPathMeta(
      wire.id,
      wire.segments,
      wire.segmentStableIds,
      revision
    );
  }

  private syncComponentNodesForWire(wire: InteractiveWireConnection): void {
    for (const n of wire.nodes) {
      if (n.type !== "component" || !n.componentId || !n.nodeId) continue;
      const c = this.components.get(n.componentId);
      if (!c) continue;
      const p = this.getNodePosition(c, n.nodeId);
      if (p) {
        n.x = p.x;
        n.y = p.y;
      }
    }
  }

  private rerouteWireAfterComponentMove(wire: InteractiveWireConnection): void {
    const ordered = wire.nodes;
    if (ordered.length < 2) return;

    const avoid = new Set<string>();
    for (const n of ordered) {
      if (n.type === "component" && n.componentId) avoid.add(n.componentId);
    }
    const avoidList = [...avoid];

    if (
      ordered.length === 2 &&
      ordered[0]!.type === "component" &&
      ordered[1]!.type === "component"
    ) {
      const a = ordered[0]!;
      const b = ordered[1]!;
      const startPos = { x: a.x, y: a.y, layer: 0 };
      const endPos = { x: b.x, y: b.y, layer: 0 };
      const prevCost = wirePathCost(wire.segments);
      const pinOpts = {
        start: { componentId: a.componentId!, nodeId: a.nodeId! },
        end: { componentId: b.componentId!, nodeId: b.nodeId! },
      };
      let path = this.routeWireWithBends(startPos, endPos, avoidList, pinOpts);
      if (
        wire.segments.length > 0 &&
        prevCost > 0 &&
        wirePathCost(path.segments) >
          prevCost * InteractiveWireSystem.ROUTE_STABILITY_COST_RATIO
      ) {
        const fb = this.wireRouter.routeWire(
          startPos,
          endPos,
          avoidList,
        );
        path = this.postProcessPath(fb, startPos, endPos);
      }
      wire.segments = path.segments;
      this.ensureNodeAnchors(wire);
      return;
    }

    let allSegs: WireSegment[] = [];
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i]!;
      const b = ordered[i + 1]!;
      const leg = this.routeSchematicPath(
        { x: a.x, y: a.y, layer: 0 },
        { x: b.x, y: b.y, layer: 0 },
        avoidList,
        {
          straightExcludeComponentIds: straightExcludeForEndpointNodes(a, b),
          endpointPins: this.endpointPinOptionsForWireNodes(a, b),
        },
      );
      if (i === 0) allSegs = allSegs.concat(leg.segments);
      else allSegs = allSegs.concat(leg.segments.slice(1));
    }
    wire.segments = this.finalizeWireSegments(allSegs);
    this.ensureNodeAnchors(wire);
  }

  private flushUpdateWirePositions(componentId: string): void {
    this.wireRouter.invalidateCaches();
    const connectedWires = Array.from(this.wires.values()).filter((wire) =>
      wire.nodes.some((node) => node.componentId === componentId)
    );

    for (const wire of connectedWires) {
      this.syncComponentNodesForWire(wire);
      this.rerouteWireAfterComponentMove(wire);
      this.drawWire(wire);
    }
    this.updateSelectionGraphics();
    this.updateJunctionGraphics();
  }

  /**
   * Reroute wire to a new point with proper drag-to-route functionality
   */
  private rerouteWire(wire: InteractiveWireConnection, point: Point): void {
    this.syncComponentNodesForWire(wire);
    const ordered = wire.nodes;
    if (ordered.length < 2) return;
    const startNode = ordered[0]!;
    const endNode = ordered[ordered.length - 1]!;

    const g = this.gridCellSize;
    const through = {
      x: Math.round(point.x / g) * g,
      y: Math.round(point.y / g) * g,
    };
    const avoid = this.collectWireAvoidComponentIds(wire);
    const startPos: RoutingPoint = { x: startNode.x, y: startNode.y, layer: 0 };
    const endPos: RoutingPoint = { x: endNode.x, y: endNode.y, layer: 0 };
    const t: RoutingPoint = { x: through.x, y: through.y, layer: 0 };
    const leg1 = this.routeSchematicPath(startPos, t, avoid, {
      straightExcludeComponentIds:
        straightExcludeForEndpointNodes(startNode),
      endpointPins: {
        start:
          startNode.type === "component" &&
          startNode.componentId &&
          startNode.nodeId
            ? {
                componentId: startNode.componentId,
                nodeId: startNode.nodeId,
              }
            : undefined,
      },
    });
    const leg2 = this.routeSchematicPath(t, endPos, avoid, {
      straightExcludeComponentIds:
        straightExcludeForEndpointNodes(endNode),
      endpointPins: {
        end:
          endNode.type === "component" &&
          endNode.componentId &&
          endNode.nodeId
            ? {
                componentId: endNode.componentId,
                nodeId: endNode.nodeId,
              }
            : undefined,
      },
    });
    wire.segments = this.finalizeWireSegments([
      ...leg1.segments,
      ...leg2.segments.slice(1),
    ]);
    this.ensureNodeAnchors(wire);
    this.drawWire(wire);
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
        const snapOnWire = this.getNearestPointOnWire(
          existingWire,
          targetPoint as Point
        );
        const tapReuseTol = Math.max(5, this.gridCellSize * 0.45);
        const reusedTap = this.findJunctionNearPointOnWires(
          snapOnWire.x,
          snapOnWire.y,
          [existingWire],
          tapReuseTol,
        );
        if (reusedTap) {
          if (!reusedTap.connectedWires.includes(wireId)) {
            reusedTap.connectedWires.push(wireId);
          }
          const junctionPos = { x: reusedTap.x, y: reusedTap.y, layer: 0 };
          const path = this.routeSchematicPath(startPos, junctionPos, [
            startComponent,
          ], {
            straightExcludeComponentIds: new Set([startComponent]),
            endpointPins: {
              start: { componentId: startComponent, nodeId: startNode },
            },
          });

          const hitGraphics = new Graphics();
          const graphics = new Graphics();
          const wire: InteractiveWireConnection = {
            id: wireId,
            nodes: [startWireNode, reusedTap],
            segments: path.segments,
            graphics,
            hitGraphics,
            isSelected: false,
            isDragging: false,
            current: 0,
            voltage: 0,
            cachedRoutes: new Map(),
          };

          this.wires.set(wireId, wire);
          this.wireContainer.addChild(hitGraphics);
          this.wireContainer.addChild(graphics);

          this.nodes.set(startWireNode.id, startWireNode);

          this.ensureNodeAnchors(wire);
          this.ensureBreaksAtJunctions(existingWire);
          this.drawWire(existingWire);
          this.drawWire(wire);
          this.notifyTopologyChanged();
          return true;
        }

        const junctionId = `junction_${this.nextNodeId++}`;
        const segIdx = this.getClosestSegmentIndex(
          existingWire,
          snapOnWire as Point
        );

        const junction: WireNode = {
          id: junctionId,
          x: snapOnWire.x,
          y: snapOnWire.y,
          type: "junction",
          connectedWires: [wireId, existingWireId],
        };

        const split =
          segIdx >= 0
            ? splitSegmentAtPoint(
                existingWire.segments,
                segIdx,
                snapOnWire,
                this.gridCellSize
              )
            : null;

        if (split) {
          existingWire.segments = split.replacement;
          junction.x = split.junctionWorld.x;
          junction.y = split.junctionWorld.y;
          this.setWireNodesTwoComponentWithJunction(existingWire, junction);
          this.ensureBreaksAtJunctions(existingWire);
          this.syncHostWireGeometryAfterTapSplit(existingWire);
          this.refreshWireDerivedState(existingWire);
        } else {
          junction.x = snapOnWire.x;
          junction.y = snapOnWire.y;
          existingWire.nodes.push(junction);
          this.rerouteWireThroughJunction(existingWire, junction);
        }

        this.nodes.set(junctionId, junction);
        const endWireNode: WireNode = junction;

        const junctionPos = { x: junction.x, y: junction.y, layer: 0 };
        const path = this.routeSchematicPath(startPos, junctionPos, [
          startComponent,
        ], {
          straightExcludeComponentIds: new Set([startComponent]),
          endpointPins: {
            start: { componentId: startComponent, nodeId: startNode },
          },
        });

        const hitGraphics = new Graphics();
        const graphics = new Graphics();
        const wire: InteractiveWireConnection = {
          id: wireId,
          nodes: [startWireNode, endWireNode],
          segments: path.segments,
          graphics,
          hitGraphics,
          isSelected: false,
          isDragging: false,
          current: 0,
          voltage: 0,
          cachedRoutes: new Map(),
        };

        this.wires.set(wireId, wire);
        this.wireContainer.addChild(hitGraphics);
        this.wireContainer.addChild(graphics);

        this.nodes.set(startWireNode.id, startWireNode);

        this.ensureNodeAnchors(wire);
        this.drawWire(existingWire);
        this.drawWire(wire);
        this.notifyTopologyChanged();
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
    const path = this.routeWireWithBends(
      startPos,
      endPos,
      [startComponent, endComponent],
      {
        start: { componentId: startComponent, nodeId: startNode },
        end: { componentId: endComponent, nodeId: endNode },
      },
    );

    const hitGraphics = new Graphics();
    const graphics = new Graphics();

    const wire: InteractiveWireConnection = {
      id: wireId,
      nodes: [startWireNode, endWireNode],
      segments: path.segments,
      graphics,
      hitGraphics,
      isSelected: false,
      isDragging: false,
      current: 0,
      voltage: 0,
      cachedRoutes: new Map(),
    };

    this.wires.set(wireId, wire);
    this.wireContainer.addChild(hitGraphics);
    this.wireContainer.addChild(graphics);

    // Store nodes
    this.nodes.set(startWireNode.id, startWireNode);
    this.nodes.set(endWireNode.id, endWireNode);

    this.ensureNodeAnchors(wire);
    this.drawWire(wire);
    this.notifyTopologyChanged();
    return true;
  }

  /**
   * Remove a wire
   */
  public removeWire(wireId: string): boolean {
    const wire = this.wires.get(wireId);
    if (!wire) return false;

    if (wire.hitGraphics) {
      this.wireContainer.removeChild(wire.hitGraphics);
      wire.hitGraphics.destroy();
    }
    this.wireContainer.removeChild(wire.graphics);
    wire.graphics.destroy();
    this.wires.delete(wireId);
    this.wireGeometryTokens.delete(wireId);

    // Clean up nodes
    for (const node of wire.nodes) {
      if (node.type === "junction" && node.connectedWires.length <= 1) {
        this.nodes.delete(node.id);
      }
    }

    try {
      (window as any).dispatchEvent?.(
        new CustomEvent("wire:disconnected", { detail: { wireId } }),
      );
    } catch {
      /* ignore */
    }
    this.notifyTopologyChanged();

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
            const path = this.routeWireWithBends(
              startPos,
              endPos,
              [startNode.componentId!, endNode.componentId!],
              {
                start: {
                  componentId: startNode.componentId!,
                  nodeId: startNode.nodeId!,
                },
                end: {
                  componentId: endNode.componentId!,
                  nodeId: endNode.nodeId!,
                },
              },
            );

            wire.segments = path.segments;
            this.ensureNodeAnchors(wire);

            // Redraw the wire
            this.drawWire(wire);
          }
        }
      }
    }
  }

  /**
   * Update wire positions when components move (debounced batch reroute).
   */
  public updateWirePositions(componentId: string): void {
    const pending = this.componentRerouteTimers.get(componentId);
    if (pending !== undefined) clearTimeout(pending);
    this.componentRerouteTimers.set(
      componentId,
      setTimeout(() => {
        this.componentRerouteTimers.delete(componentId);
        this.flushUpdateWirePositions(componentId);
      }, this.componentRerouteDebounceMs)
    );
  }

  /**
   * Re-run the router for every wire from current pin/junction positions.
   * Used after loading a saved project so old geometry is not kept by the move-reroute cost cap
   * and all wires match the current grid/router.
   */
  public refreshAllWireGeometry(): void {
    this.wireRouter.invalidateCaches();
    this.reroutePreviewGraphics.clear();
    this.clearSnapIndicators();
    for (const wire of this.wires.values()) {
      wire.segments = [];
      this.wireGeometryTokens.delete(wire.id);
      this.syncComponentNodesForWire(wire);
      this.rerouteWireAfterComponentMove(wire);
      this.drawWire(wire);
    }
    this.updateSelectionGraphics();
    this.updateJunctionGraphics();
  }

  /**
   * Restore exact persisted wire geometry (nodes/segments/path meta) for deterministic reloads.
   * Returns false when wire id is missing or payload is invalid.
   */
  public restoreWireGeometry(
    wireId: string,
    payload: {
      nodes?: Array<{
        id: string;
        x: number;
        y: number;
        type: "component" | "junction" | "waypoint";
        componentId?: string;
        nodeId?: string;
        connectedWires: string[];
      }>;
      segments?: Array<{
        start: { x: number; y: number };
        end: { x: number; y: number };
        isHorizontal: boolean;
        layer: number;
      }>;
      segmentStableIds?: string[];
      routeRevision?: number;
      animationPathMeta?: { segmentIds: string[]; revision: number };
    },
  ): boolean {
    const wire = this.wires.get(wireId);
    if (!wire) return false;
    const nodes = payload.nodes;
    const segments = payload.segments;
    if (!Array.isArray(nodes) || !Array.isArray(segments) || segments.length === 0) {
      return false;
    }

    wire.nodes = nodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      type: n.type,
      componentId: n.componentId,
      nodeId: n.nodeId,
      connectedWires: Array.isArray(n.connectedWires) ? [...n.connectedWires] : [],
    }));
    wire.segments = segments.map((s) => ({
      start: { x: s.start.x, y: s.start.y },
      end: { x: s.end.x, y: s.end.y },
      isHorizontal: Boolean(s.isHorizontal),
      layer: Number.isFinite(s.layer) ? s.layer : 0,
    }));
    wire.segmentStableIds = payload.segmentStableIds
      ? [...payload.segmentStableIds]
      : undefined;
    wire.routeRevision =
      typeof payload.routeRevision === "number" ? payload.routeRevision : wire.routeRevision;
    wire.animationPathMeta = payload.animationPathMeta
      ? {
          segmentIds: [...payload.animationPathMeta.segmentIds],
          revision: payload.animationPathMeta.revision,
        }
      : undefined;
    this.drawWire(wire);
    this.updateSelectionGraphics();
    this.updateJunctionGraphics();
    return true;
  }

  /** Read-only schematic junction map (editor topology). */
  public getSchematicJunctionMap() {
    return this.wireGraphView.getJunctionsFromWires(this.wires);
  }

  /**
   * Preview / editor helper: same router + post-process as committed wires.
   * Returns a contiguous world-space polyline (orthogonal geometry).
   */
  public getPreviewRoutePolyline(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    avoidComponentIds: string[],
    snap?: { ax?: boolean; ay?: boolean; bx?: boolean; by?: boolean },
    endpointPins?: {
      start?: SchematicEndpointPinRef;
      end?: SchematicEndpointPinRef;
    },
  ): { x: number; y: number }[] {
    const g = this.gridCellSize;
    const sa = (v: number, on: boolean | undefined) =>
      on !== false ? Math.round(v / g) * g : v;
    const sx0 = sa(ax, snap?.ax);
    const sy0 = sa(ay, snap?.ay);
    const sx1 = sa(bx, snap?.bx);
    const sy1 = sa(by, snap?.by);
    const start: RoutingPoint = { x: sx0, y: sy0, layer: 0 };
    const end: RoutingPoint = { x: sx1, y: sy1, layer: 0 };
    const path = this.routeSchematicPath(start, end, avoidComponentIds, {
      straightExcludeComponentIds: new Set(avoidComponentIds),
      endpointPins,
    });
    return this.segmentsToPolylinePoints(path.segments);
  }

  private segmentsToPolylinePoints(
    segments: WireSegment[],
  ): { x: number; y: number }[] {
    if (!segments.length) return [];
    const out: { x: number; y: number }[] = [];
    for (const s of segments) {
      if (!out.length) out.push({ x: s.start.x, y: s.start.y });
      out.push({ x: s.end.x, y: s.end.y });
    }
    return out;
  }

  private collectWireAvoidComponentIds(
    wire: InteractiveWireConnection,
  ): string[] {
    const s = new Set<string>();
    for (const n of wire.nodes) {
      if (n.type === "component" && n.componentId) s.add(n.componentId);
    }
    return [...s];
  }

  private endpointPinOptionsForWireNodes(
    a: WireNode,
    b: WireNode,
  ): { start?: SchematicEndpointPinRef; end?: SchematicEndpointPinRef } {
    const start =
      a.type === "component" && a.componentId && a.nodeId
        ? { componentId: a.componentId, nodeId: a.nodeId }
        : undefined;
    const end =
      b.type === "component" && b.componentId && b.nodeId
        ? { componentId: b.componentId, nodeId: b.nodeId }
        : undefined;
    return { start, end };
  }

  private getPinEscapeStub(ref: SchematicEndpointPinRef): {
    pin: RoutingPoint;
    anchor: RoutingPoint;
    isHorizontal: boolean;
  } | null {
    const comp = this.components.get(ref.componentId);
    if (!comp) return null;
    const pin = this.getNodePosition(comp, ref.nodeId);
    if (!pin) return null;
    const node = comp.getNode(ref.nodeId);
    if (!node) return null;
    const dir = comp.getWireExitDirForNode(ref.nodeId);
    const minPx = node.wireEscapeMinPx ?? DesignTokens.wire.escapeMinPx;
    const anchor: RoutingPoint = {
      x: pin.x + dir.x * minPx,
      y: pin.y + dir.y * minPx,
      layer: 0,
    };
    if (Math.hypot(anchor.x - pin.x, anchor.y - pin.y) < 0.5) return null;
    return {
      pin,
      anchor,
      isHorizontal: dir.y === 0,
    };
  }

  private wirePathMetrics(segments: WireSegment[]): WirePath {
    let totalLength = 0;
    let bends = 0;
    let prevH: boolean | null = null;
    for (const s of segments) {
      totalLength +=
        Math.abs(s.end.x - s.start.x) + Math.abs(s.end.y - s.start.y);
      if (prevH !== null && prevH !== s.isHorizontal) bends++;
      prevH = s.isHorizontal;
    }
    return { segments, totalLength, bendCount: bends, layer: 0 };
  }

  /**
   * Route wire using open-source algorithms (Dagre.js and A*)
   */
  private routeWireWithBends(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponents: string[],
    endpointPins?: {
      start?: SchematicEndpointPinRef;
      end?: SchematicEndpointPinRef;
    },
  ): WirePath {
    return this.routeSchematicPath(start, end, avoidComponents, {
      straightExcludeComponentIds: new Set(avoidComponents),
      endpointPins,
    });
  }

  /**
   * Ensure the path anchors exactly at start/end nodes and is clean
   */
  private postProcessPath(
    path: WirePath,
    start: RoutingPoint,
    end: RoutingPoint,
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

    const merged = this.finalizeWireSegments(segments);

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

  /** Collinear merge + prune tiny H–V–H stair steps (grid / float noise). */
  private finalizeWireSegments(segments: WireSegment[]): WireSegment[] {
    return finalizeOrthogonalWireSegments(
      segments,
      Math.max(4, this.gridCellSize * 0.45),
    );
  }

  private static readonly ROUTE_STABILITY_COST_RATIO = 1.15;

  /**
   * Unified schematic route used for preview, commit, multi-leg, and reroute.
   * Straight segments when aligned and clear; else obstacle orthogonal router.
   */
  private routeSchematicPath(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponentIds: string[],
    options?: {
      straightExcludeComponentIds?: Set<string>;
      stabilizeAgainstCost?: number;
      stabilizeActive?: boolean;
      endpointPins?: {
        start?: SchematicEndpointPinRef;
        end?: SchematicEndpointPinRef;
      };
    },
  ): WirePath {
    const straightEx =
      options?.straightExcludeComponentIds ??
      new Set(avoidComponentIds);

    let routeStart = start;
    let routeEnd = end;
    const prefixSegs: WireSegment[] = [];
    const suffixSegs: WireSegment[] = [];

    if (options?.endpointPins?.start) {
      const stub = this.getPinEscapeStub(options.endpointPins.start);
      if (stub) {
        routeStart = stub.anchor;
        prefixSegs.push({
          start: { ...stub.pin, layer: 0 },
          end: { ...stub.anchor, layer: 0 },
          isHorizontal: stub.isHorizontal,
          layer: 0,
        });
      }
    }
    if (options?.endpointPins?.end) {
      const stub = this.getPinEscapeStub(options.endpointPins.end);
      if (stub) {
        routeEnd = stub.anchor;
        suffixSegs.push({
          start: { ...stub.anchor, layer: 0 },
          end: { ...stub.pin, layer: 0 },
          isHorizontal: stub.isHorizontal,
          layer: 0,
        });
      }
    }

    const raw = computeSchematicRoute({
      start: routeStart,
      end: routeEnd,
      avoidComponentIds,
      straightExcludeComponentIds: straightEx,
      components: this.components,
      routeOrthogonal: (s, e, a) => this.wireRouter.routeWire(s, e, a),
      gridPx: this.gridCellSize,
    });

    let mid = raw.segments.map((s) => ({
      start: { ...s.start, layer: s.start.layer ?? 0 },
      end: { ...s.end, layer: s.end.layer ?? 0 },
      isHorizontal: s.isHorizontal,
      layer: s.layer ?? 0,
    }));

    if (
      mid.length === 0 &&
      Math.hypot(routeEnd.x - routeStart.x, routeEnd.y - routeStart.y) > 0.5
    ) {
      const fb = this.wireRouter.routeWire(
        routeStart,
        routeEnd,
        avoidComponentIds,
      );
      mid = fb.segments.map((s) => ({
        start: { ...s.start, layer: s.start.layer ?? 0 },
        end: { ...s.end, layer: s.end.layer ?? 0 },
        isHorizontal: s.isHorizontal,
        layer: s.layer ?? 0,
      }));
    }

    if (prefixSegs.length && mid.length) {
      mid[0] = {
        ...mid[0]!,
        start: { ...prefixSegs[0]!.end, layer: 0 },
      };
    }
    if (suffixSegs.length && mid.length) {
      const li = mid.length - 1;
      mid[li] = {
        ...mid[li]!,
        end: { ...suffixSegs[0]!.start, layer: 0 },
      };
    }

    const mergedMid = mergeCollinearOrthoSegments(mid);
    const combined = [...prefixSegs, ...mergedMid, ...suffixSegs];
    let path = this.wirePathMetrics(combined);
    path = this.postProcessPath(path, start, end);
    if (
      options?.stabilizeActive &&
      options.stabilizeAgainstCost !== undefined &&
      options.stabilizeAgainstCost > 0 &&
      wirePathCost(path.segments) >
        options.stabilizeAgainstCost *
          InteractiveWireSystem.ROUTE_STABILITY_COST_RATIO
    ) {
      const fb = this.wireRouter.routeWire(start, end, avoidComponentIds);
      path = this.postProcessPath(fb, start, end);
    }
    return path;
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
    const tok = this.wireGeometryToken(wire);
    if (this.wireGeometryTokens.get(wire.id) !== tok) {
      this.wireGeometryTokens.set(wire.id, tok);
      this.refreshWireDerivedState(wire);
    }
    const graphics = wire.graphics;
    const hit = wire.hitGraphics;
    graphics.clear();
    if (hit) hit.clear();

    let color = this.wireColor;
    if (wire.isSelected) {
      color = this.selectedWireColor;
    } else if (wire.id === this.interactionState.hoveredWire) {
      color = this.hoveredWireColor;
    }

    if (wire.segments.length > 0) {
      drawRoundedOrthoWire(
        graphics,
        wire.segments,
        { width: this.wireThickness, color, alpha: 1 },
        schematicCornerRadius()
      );
      if (hit) {
        drawWireHitPath(hit, wire.segments, schematicHitStrokeWidth());
      }

      const firstSegment = wire.segments[0];
      const lastSegment = wire.segments[wire.segments.length - 1];
      graphics.circle(firstSegment.start.x, firstSegment.start.y, 3);
      graphics.fill(color);
      graphics.circle(lastSegment.end.x, lastSegment.end.y, 3);
      graphics.fill(color);
    }

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
            if (!otherStart) continue;
            this.rerouteBranchToJunctionSchematic(other, otherStart, node);
            this.ensureNodeAnchors(other);
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
            if (!otherStart) continue;
            this.rerouteBranchToJunctionSchematic(other, otherStart, node);
            this.ensureNodeAnchors(other);
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

    const head = wire.nodes[0];
    const tail = wire.nodes[wire.nodes.length - 1];
    if (!head || !tail) return;

    // Topology order: pin → … → pin | junction (junctions use stored x,y)
    const startPos = this.resolveNodeWorldPosition(head);
    const endPos = this.resolveNodeWorldPosition(tail);

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
    const hasJunction = wire.nodes.some((n) => n.type === "junction");
    // Reversing a net that already has tap junctions breaks T-topology that was built
    // from an in-place split (segments are ordered and nodes are [A, J, B]).
    if (
      !hasJunction &&
      distStartToLast + 0.01 < distStartToFirst
    ) {
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

    // Final merge of collinear neighbors; keep explicit breaks at junctions only.
    const merged: typeof wire.segments = [];
    const raw = wire.segments;
    for (let si = 0; si < raw.length; si++) {
      const s = raw[si]!;
      const prev = merged[merged.length - 1];
      const seamHasJunction = this.hasJunctionAtPoint(
        wire,
        s.start.x,
        s.start.y,
        2
      );
      const canCollinearMerge =
        prev &&
        !seamHasJunction &&
        prev.isHorizontal === s.isHorizontal &&
        prev.end.x === s.start.x &&
        prev.end.y === s.start.y;
      if (canCollinearMerge) {
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
    const pinStart =
      wire.segments.length > 0
        ? { ...wire.segments[0].start }
        : { x: 0, y: 0, layer: 0 };
    const pinEnd =
      wire.segments.length > 0
        ? { ...wire.segments[wire.segments.length - 1].end }
        : { x: 0, y: 0, layer: 0 };
    const normalized: WireSegment[] = [];

    for (let i = 0; i < wire.segments.length; i++) {
      const s0 = wire.segments[i];
      const s: WireSegment = {
        start: { x: round(s0.start.x), y: round(s0.start.y), layer: 0 },
        end: { x: round(s0.end.x), y: round(s0.end.y), layer: 0 },
        isHorizontal: s0.isHorizontal,
        layer: 0,
      };

      // Re-derive orientation: near-axis segments must stay axis-locked (rounding
      // noise was flipping short horiz/vert legs and opening gaps at T-junctions).
      const dx = Math.abs(s.end.x - s.start.x);
      const dy = Math.abs(s.end.y - s.start.y);
      const axisEps = 0.75;
      let horiz = s0.isHorizontal;
      if (dy < axisEps && dx >= axisEps) horiz = true;
      else if (dx < axisEps && dy >= axisEps) horiz = false;
      else if (dx >= dy) horiz = true;
      else horiz = false;
      s.isHorizontal = horiz;
      if (horiz) {
        s.end.y = s.start.y;
      } else {
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

      const prev = normalized[normalized.length - 1];
      const canMerge =
        prev &&
        prev.isHorizontal === s.isHorizontal &&
        prev.end.x === s.start.x &&
        prev.end.y === s.start.y;
      if (canMerge) {
        prev.end = { ...s.end } as any;
      } else {
        normalized.push(s);
      }
    }

    wire.segments = normalized;
    if (normalized.length > 0) {
      normalized[0].start = { ...pinStart, layer: 0 };
      if (normalized[0].isHorizontal) {
        normalized[0].end.y = normalized[0].start.y;
      } else {
        normalized[0].end.x = normalized[0].start.x;
      }
      const Li = normalized.length - 1;
      normalized[Li].end = { ...pinEnd, layer: 0 };
      const last = normalized[Li];
      if (last.isHorizontal) last.start.y = last.end.y;
      else last.start.x = last.end.x;
    }
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

    // Explicit electrical junctions (T-joins): visible dot distinct from wire crossings.
    this.nodes.forEach((node) => {
      if (node.type === "junction") {
        this.junctionGraphics.circle(node.x, node.y, 5.5);
        this.junctionGraphics.fill({ color: this.junctionColor, alpha: 1 });
        this.junctionGraphics.circle(node.x, node.y, 8);
        this.junctionGraphics.stroke({
          width: 2,
          color: 0xfff8e7,
          alpha: 0.85,
        });
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
   * Component type for a placed component id (wires use this for flow conventions).
   */
  public getComponentType(componentId: string): string | undefined {
    return this.components.get(componentId)?.getComponentType();
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
      if (wire.hitGraphics) {
        this.wireContainer.removeChild(wire.hitGraphics);
        wire.hitGraphics.destroy();
      }
      this.wireContainer.removeChild(wire.graphics);
      wire.graphics.destroy();
    });
    this.wires.clear();
    this.nodes.clear();
    this.wireGeometryTokens.clear();
  }

  /**
   * Delete selected wire
   */
  public deleteSelectedWire(): boolean {
    if (!this.interactionState.selectedWire) return false;

    const wireId = this.interactionState.selectedWire;
    const wire = this.wires.get(wireId);
    if (!wire) return false;

    if (wire.hitGraphics?.parent) {
      wire.hitGraphics.parent.removeChild(wire.hitGraphics);
    }
    wire.hitGraphics?.destroy();
    if (wire.graphics.parent) {
      wire.graphics.parent.removeChild(wire.graphics);
    }
    wire.graphics.destroy();

    for (const node of wire.nodes) {
      this.nodes.delete(node.id);
    }

    this.wires.delete(wireId);
    this.wireGeometryTokens.delete(wireId);
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

    this.notifyTopologyChanged();
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
    for (const t of this.componentRerouteTimers.values()) clearTimeout(t);
    this.componentRerouteTimers.clear();
    this.clearWires();
    this.wireContainer.destroy();
    this.wireRouter.invalidateCaches();
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
