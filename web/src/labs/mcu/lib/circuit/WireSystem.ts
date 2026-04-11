import { Graphics, Container } from "pixi.js";
import { CircuitComponent } from "./CircuitComponent";
import { GridCanvas } from "./GridCanvas";

export interface WireSegment {
  start: { x: number; y: number };
  end: { x: number; y: number };
  isHorizontal: boolean;
  layer?: number;
}

export interface WireConnection {
  id: string;
  startComponent: string;
  startNode: string;
  endComponent: string;
  endNode: string;
  segments: WireSegment[];
  graphics: Graphics;
  current: number;
  voltage: number;
}

export interface RoutingOptions {
  avoidComponents: boolean;
  preferOrthogonal: boolean;
  minimizeBends: boolean;
  gridSnap: boolean;
}

/**
 * Wire system with automatic routing and component avoidance
 */
export class WireSystem {
  private wires: Map<string, WireConnection>;
  private wireContainer: Container;
  private gridCanvas: GridCanvas;
  private components: Map<string, CircuitComponent>;
  private routingOptions: RoutingOptions;

  // Visual settings
  private wireColor: number = 0xffffff;
  private wireThickness: number = 2;
  private currentFlowColor: number = 0x00ffff;
  private highlightColor: number = 0xffff00;
  private tempWireColor: number = 0x00ff00;

  // Routing constants from reference implementation
  private readonly COMPONENT_PADDING = 40;
  private readonly COMPONENT_BASE_WIDTH = 80;
  private readonly COMPONENT_BASE_HEIGHT = 60;

  // Temporary wire for preview
  private tempWireGraphic: Graphics | null = null;

  constructor(gridCanvas: GridCanvas) {
    this.wires = new Map();
    this.wireContainer = new Container();
    this.gridCanvas = gridCanvas;
    this.components = new Map();

    this.routingOptions = {
      avoidComponents: true,
      preferOrthogonal: true,
      minimizeBends: true,
      gridSnap: true,
    };
  }

  /**
   * Get wire container for adding to scene
   */
  public getContainer(): Container {
    return this.wireContainer;
  }

  /**
   * Register a component for wire routing
   */
  public registerComponent(component: CircuitComponent): void {
    this.components.set(component.getName(), component);
  }

  /**
   * Unregister a component
   */
  public unregisterComponent(componentId: string): void {
    this.components.delete(componentId);

    // Remove any wires connected to this component
    const wiresToRemove: string[] = [];
    this.wires.forEach((wire, wireId) => {
      if (
        wire.startComponent === componentId ||
        wire.endComponent === componentId
      ) {
        wiresToRemove.push(wireId);
      }
    });

    wiresToRemove.forEach((wireId) => this.removeWire(wireId));
  }

  /**
   * Create a wire connection between two component nodes
   */
  public createWire(
    startComponentId: string,
    startNodeId: string,
    endComponentId: string,
    endNodeId: string
  ): string | null {
    const startComponent = this.components.get(startComponentId);
    const endComponent = this.components.get(endComponentId);

    if (!startComponent || !endComponent) {
      console.error("Cannot create wire: component not found");
      return null;
    }

    const startNode = startComponent.getNode(startNodeId);
    const endNode = endComponent.getNode(endNodeId);

    if (!startNode || !endNode) {
      console.error("Cannot create wire: node not found");
      return null;
    }

    // Generate unique wire ID
    const wireId = `wire_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Get world positions of nodes using world transform (accounts for rotation/flipping)
    // toGlobal converts to screen space, then toLocal converts to wire container's local space
    const startNodeGlobal = startComponent
      .displayObject()
      .toGlobal(startNode.position);
    const endNodeGlobal = endComponent
      .displayObject()
      .toGlobal(endNode.position);

    const startNodeLocal = this.wireContainer.toLocal(startNodeGlobal);
    const endNodeLocal = this.wireContainer.toLocal(endNodeGlobal);

    const startWorldPos = {
      x: startNodeLocal.x,
      y: startNodeLocal.y,
    };

    const endWorldPos = {
      x: endNodeLocal.x,
      y: endNodeLocal.y,
    };

    // Route the wire
    const segments = this.routeWire(startWorldPos, endWorldPos);

    // Create graphics
    const graphics = new Graphics();
    this.wireContainer.addChild(graphics);

    // Create wire connection
    const wire: WireConnection = {
      id: wireId,
      startComponent: startComponentId,
      startNode: startNodeId,
      endComponent: endComponentId,
      endNode: endNodeId,
      segments,
      graphics,
      current: 0,
      voltage: 0,
    };

    this.wires.set(wireId, wire);
    this.drawWire(wire);

    console.log(
      `🔗 Created wire ${wireId} from ${startComponentId}.${startNodeId} to ${endComponentId}.${endNodeId}`
    );
    return wireId;
  }

  /**
   * Remove a wire
   */
  public removeWire(wireId: string): boolean {
    const wire = this.wires.get(wireId);
    if (!wire) return false;

    // Remove graphics
    if (wire.graphics.parent) {
      wire.graphics.parent.removeChild(wire.graphics);
    }
    wire.graphics.destroy();

    this.wires.delete(wireId);
    console.log(`🗑️ Removed wire ${wireId}`);
    return true;
  }

  /**
   * Route a wire between two points with automatic pathfinding
   */
  private routeWire(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): WireSegment[] {
    // Don't snap wire endpoints to grid - they should connect exactly to node positions
    // Grid snapping is only for intermediate waypoints if needed

    // Use A* pathfinding with component avoidance
    if (this.routingOptions.avoidComponents) {
      return this.routeWithAvoidance(start, end);
    } else {
      return this.routeSimple(start, end);
    }
  }

  /**
   * Simple orthogonal routing without component avoidance
   */
  private routeSimple(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): WireSegment[] {
    const segments: WireSegment[] = [];

    if (this.routingOptions.preferOrthogonal) {
      // L-shaped routing (horizontal then vertical, or vice versa)
      const dx = Math.abs(end.x - start.x);
      const dy = Math.abs(end.y - start.y);

      if (dx > dy) {
        // Horizontal first
        if (start.x !== end.x) {
          segments.push({
            start: { x: start.x, y: start.y },
            end: { x: end.x, y: start.y },
            isHorizontal: true,
          });
        }
        if (start.y !== end.y) {
          segments.push({
            start: { x: end.x, y: start.y },
            end: { x: end.x, y: end.y },
            isHorizontal: false,
          });
        }
      } else {
        // Vertical first
        if (start.y !== end.y) {
          segments.push({
            start: { x: start.x, y: start.y },
            end: { x: start.x, y: end.y },
            isHorizontal: false,
          });
        }
        if (start.x !== end.x) {
          segments.push({
            start: { x: start.x, y: end.y },
            end: { x: end.x, y: end.y },
            isHorizontal: true,
          });
        }
      }
    } else {
      // Direct line
      segments.push({
        start,
        end,
        isHorizontal: Math.abs(end.x - start.x) > Math.abs(end.y - start.y),
      });
    }

    return segments;
  }

  /**
   * Advanced routing with component avoidance using A* pathfinding
   */
  private routeWithAvoidance(
    start: { x: number; y: number },
    end: { x: number; y: number }
  ): WireSegment[] {
    const gridStart = this.gridCanvas.worldToGrid(start.x, start.y);
    const gridEnd = this.gridCanvas.worldToGrid(end.x, end.y);

    // Create occupancy grid
    const occupancyGrid = this.createOccupancyGrid();

    // A* pathfinding
    const path = this.findPath(gridStart, gridEnd, occupancyGrid);

    if (path.length === 0) {
      console.warn("No path found, falling back to simple routing");
      return this.routeSimple(start, end);
    }

    // Convert path to wire segments
    return this.pathToSegments(path);
  }

  /**
   * Create occupancy grid marking component positions
   */
  private createOccupancyGrid(): boolean[][] {
    const gridDims = this.gridCanvas.getGridDimensions();
    const grid: boolean[][] = Array(gridDims.height + 1)
      .fill(false)
      .map(() => Array(gridDims.width + 1).fill(false));

    // Mark component positions as occupied
    this.components.forEach((component) => {
      const pos = component.getPosition();
      const gridPos = this.gridCanvas.worldToGrid(pos.x, pos.y);

      // Mark a 3x3 area around each component as occupied
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = gridPos.x + dx;
          const y = gridPos.y + dy;

          if (x >= 0 && x <= gridDims.width && y >= 0 && y <= gridDims.height) {
            grid[y][x] = true;
          }
        }
      }
    });

    return grid;
  }

  /**
   * A* pathfinding algorithm
   */
  private findPath(
    start: { x: number; y: number },
    end: { x: number; y: number },
    occupancyGrid: boolean[][]
  ): { x: number; y: number }[] {
    interface Node {
      x: number;
      y: number;
      g: number; // Cost from start
      h: number; // Heuristic cost to end
      f: number; // Total cost
      parent: Node | null;
    }

    const openSet: Node[] = [];
    const closedSet: Set<string> = new Set();

    const startNode: Node = {
      x: start.x,
      y: start.y,
      g: 0,
      h: this.gridCanvas.manhattanDistance(start, end),
      f: 0,
      parent: null,
    };
    startNode.f = startNode.g + startNode.h;

    openSet.push(startNode);

    const gridDims = this.gridCanvas.getGridDimensions();

    while (openSet.length > 0) {
      // Find node with lowest f score
      let currentIndex = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[currentIndex].f) {
          currentIndex = i;
        }
      }

      const current = openSet.splice(currentIndex, 1)[0];
      const currentKey = `${current.x},${current.y}`;
      closedSet.add(currentKey);

      // Check if we reached the end
      if (current.x === end.x && current.y === end.y) {
        const path: { x: number; y: number }[] = [];
        let node: Node | null = current;

        while (node) {
          path.unshift({ x: node.x, y: node.y });
          node = node.parent;
        }

        return path;
      }

      // Check neighbors (4-directional)
      const neighbors = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ];

      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;

        // Skip if out of bounds
        if (
          neighbor.x < 0 ||
          neighbor.x > gridDims.width ||
          neighbor.y < 0 ||
          neighbor.y > gridDims.height
        ) {
          continue;
        }

        // Skip if occupied (except start and end)
        if (
          occupancyGrid[neighbor.y][neighbor.x] &&
          !(neighbor.x === start.x && neighbor.y === start.y) &&
          !(neighbor.x === end.x && neighbor.y === end.y)
        ) {
          continue;
        }

        // Skip if already processed
        if (closedSet.has(neighborKey)) {
          continue;
        }

        const g = current.g + 1;
        const h = this.gridCanvas.manhattanDistance(neighbor, end);
        const f = g + h;

        // Check if this path to neighbor is better
        const existingIndex = openSet.findIndex(
          (n) => n.x === neighbor.x && n.y === neighbor.y
        );

        if (existingIndex === -1) {
          // New node
          openSet.push({
            x: neighbor.x,
            y: neighbor.y,
            g,
            h,
            f,
            parent: current,
          });
        } else if (g < openSet[existingIndex].g) {
          // Better path to existing node
          openSet[existingIndex].g = g;
          openSet[existingIndex].f = f;
          openSet[existingIndex].parent = current;
        }
      }
    }

    return []; // No path found
  }

  /**
   * Convert grid path to wire segments
   */
  private pathToSegments(path: { x: number; y: number }[]): WireSegment[] {
    if (path.length < 2) return [];

    const segments: WireSegment[] = [];
    let segmentStart = path[0];
    let currentDirection: "horizontal" | "vertical" | null = null;

    for (let i = 1; i < path.length; i++) {
      const point = path[i];
      const dx = point.x - segmentStart.x;
      const dy = point.y - segmentStart.y;

      let direction: "horizontal" | "vertical";
      if (Math.abs(dx) > Math.abs(dy)) {
        direction = "horizontal";
      } else {
        direction = "vertical";
      }

      // If direction changed or we're at the end, create a segment
      if (
        (currentDirection && direction !== currentDirection) ||
        i === path.length - 1
      ) {
        const segmentEnd = i === path.length - 1 ? point : path[i - 1];

        const startWorld = this.gridCanvas.gridToWorld(
          segmentStart.x,
          segmentStart.y
        );
        const endWorld = this.gridCanvas.gridToWorld(
          segmentEnd.x,
          segmentEnd.y
        );

        segments.push({
          start: startWorld,
          end: endWorld,
          isHorizontal: currentDirection === "horizontal",
        });

        segmentStart = segmentEnd;
      }

      currentDirection = direction;
    }

    return segments;
  }

  /**
   * Draw a wire
   */
  private drawWire(wire: WireConnection): void {
    const graphics = wire.graphics;
    graphics.clear();

    // Draw wire segments
    wire.segments.forEach((segment) => {
      graphics.moveTo(segment.start.x, segment.start.y);
      graphics.lineTo(segment.end.x, segment.end.y);
      graphics.stroke({ width: this.wireThickness, color: this.wireColor });
    });

    // Draw connection dots at endpoints
    if (wire.segments.length > 0) {
      const firstSegment = wire.segments[0];
      const lastSegment = wire.segments[wire.segments.length - 1];

      graphics.circle(firstSegment.start.x, firstSegment.start.y, 3);
      graphics.fill(this.wireColor);
      graphics.circle(lastSegment.end.x, lastSegment.end.y, 3);
      graphics.fill(this.wireColor);
    }

    // Draw current flow animation if current is flowing
    if (Math.abs(wire.current) > 0.001) {
      this.drawCurrentFlow(wire);
    }
  }

  /**
   * Draw current flow animation on wire
   */
  private drawCurrentFlow(wire: WireConnection): void {
    const flowGraphics = new Graphics();

    const animationTime = Date.now() / 300; // 300ms cycle
    const flowDirection = wire.current > 0 ? 1 : -1;

    // Draw moving dots along each segment
    wire.segments.forEach((segment, segmentIndex) => {
      const segmentLength = Math.sqrt(
        Math.pow(segment.end.x - segment.start.x, 2) +
          Math.pow(segment.end.y - segment.start.y, 2)
      );

      const numDots = Math.max(1, Math.floor(segmentLength / 30)); // One dot every 30 pixels

      for (let i = 0; i < numDots; i++) {
        const progress =
          (i / numDots + animationTime * flowDirection + segmentIndex) % 1;
        if (progress < 0) continue;

        const x =
          segment.start.x + (segment.end.x - segment.start.x) * progress;
        const y =
          segment.start.y + (segment.end.y - segment.start.y) * progress;

        flowGraphics.circle(x, y, 2);
        flowGraphics.fill({ color: this.currentFlowColor, alpha: 0.8 });
      }
    });
    this.wireContainer.addChild(flowGraphics);

    // Remove after animation frame
    setTimeout(() => {
      if (flowGraphics.parent) {
        flowGraphics.parent.removeChild(flowGraphics);
      }
      flowGraphics.destroy();
    }, 16);
  }

  /**
   * Update wire states (current, voltage) from analysis results.
   * Extracts current from component terminal data when available.
   */
  public updateWireStates(analysisResults: any): void {
    const componentCurrents: Record<string, Record<string, number>> =
      analysisResults?.componentTerminalCurrents ?? {};
    const components: Array<{ id: string; current: number }> =
      analysisResults?.components ?? [];

    this.wires.forEach((wire) => {
      let current = 0;
      let voltage = 0;

      // Try to extract current from the terminal data (typed snapshot)
      if (
        wire.startComponentId &&
        componentCurrents[wire.startComponentId]
      ) {
        const termCurrents = componentCurrents[wire.startComponentId];
        const termId = wire.startNodeId ?? Object.keys(termCurrents)[0];
        if (termId && termCurrents[termId] !== undefined) {
          current = termCurrents[termId];
        }
      }

      // Fallback: look in the legacy components array
      if (Math.abs(current) < 1e-9 && wire.startComponentId) {
        const comp = components.find((c: any) => c.id === wire.startComponentId);
        if (comp) current = comp.current ?? 0;
      }

      // Voltage from node voltages
      const nodeVoltages: Record<string, number> =
        analysisResults?.nodeVoltages ?? {};
      if (wire.startNodeId && nodeVoltages[wire.startNodeId] !== undefined) {
        voltage = nodeVoltages[wire.startNodeId];
      }

      wire.current = current;
      wire.voltage = voltage;

      this.drawWire(wire);
    });
  }

  /**
   * Get all wires
   */
  public getWires(): Map<string, WireConnection> {
    return new Map(this.wires);
  }

  /**
   * Get all wires as an array
   */
  public getAllWires(): WireConnection[] {
    return Array.from(this.wires.values());
  }

  /**
   * Get wire by ID
   */
  public getWire(wireId: string): WireConnection | undefined {
    return this.wires.get(wireId);
  }

  /**
   * Update/redraw a specific wire (e.g., after component transformation)
   */
  public updateWire(wireId: string): boolean {
    const wire = this.wires.get(wireId);
    if (!wire) {
      console.warn(`Wire ${wireId} not found in system`);
      return false;
    }

    const startComponent = this.components.get(wire.startComponent);
    const endComponent = this.components.get(wire.endComponent);

    if (!startComponent || !endComponent) {
      console.warn(`Cannot update wire ${wireId}: component not found`);
      return false;
    }

    const startNode = startComponent.getNode(wire.startNode);
    const endNode = endComponent.getNode(wire.endNode);

    if (!startNode || !endNode) {
      console.warn(`Cannot update wire ${wireId}: node not found`);
      return false;
    }

    // Get new node positions using world transform (accounts for rotation/flipping)
    // toGlobal converts to screen space, then toLocal converts to wire container's local space
    const startNodeGlobal = startComponent
      .displayObject()
      .toGlobal(startNode.position);
    const endNodeGlobal = endComponent
      .displayObject()
      .toGlobal(endNode.position);

    const startNodeLocal = this.wireContainer.toLocal(startNodeGlobal);
    const endNodeLocal = this.wireContainer.toLocal(endNodeGlobal);

    const startPos = {
      x: startNodeLocal.x,
      y: startNodeLocal.y,
    };

    const endPos = {
      x: endNodeLocal.x,
      y: endNodeLocal.y,
    };

    console.log(
      `      Wire positions: start(${startPos.x.toFixed(1)}, ${startPos.y.toFixed(1)}) → end(${endPos.x.toFixed(1)}, ${endPos.y.toFixed(1)})`
    );

    // Re-route the wire with new positions
    const segments = this.routeWire(startPos, endPos);
    wire.segments = segments;

    console.log(`      Re-routed with ${segments.length} segments`);

    // Redraw the wire
    this.drawWire(wire);

    return true;
  }

  /**
   * Update routing options
   */
  public updateRoutingOptions(options: Partial<RoutingOptions>): void {
    Object.assign(this.routingOptions, options);

    // Re-route all wires with new options
    this.wires.forEach((wire) => {
      const startComponent = this.components.get(wire.startComponent);
      const endComponent = this.components.get(wire.endComponent);

      if (startComponent && endComponent) {
        const startNode = startComponent.getNode(wire.startNode);
        const endNode = endComponent.getNode(wire.endNode);

        if (startNode && endNode) {
          const startPos = startComponent.getPosition();
          const endPos = endComponent.getPosition();

          const startWorldPos = {
            x: startPos.x + startNode.position.x,
            y: startPos.y + startNode.position.y,
          };

          const endWorldPos = {
            x: endPos.x + endNode.position.x,
            y: endPos.y + endNode.position.y,
          };

          wire.segments = this.routeWire(startWorldPos, endWorldPos);
          this.drawWire(wire);
        }
      }
    });
  }

  /**
   * Start temporary wire for preview (from reference implementation)
   */
  public startTempWire(startPos: { x: number; y: number }): void {
    if (this.tempWireGraphic) {
      this.wireContainer.removeChild(this.tempWireGraphic);
      this.tempWireGraphic.destroy();
    }

    this.tempWireGraphic = new Graphics();
    this.wireContainer.addChild(this.tempWireGraphic);
  }

  /**
   * Update temporary wire preview
   */
  public updateTempWire(
    startPos: { x: number; y: number },
    currentPos: { x: number; y: number }
  ): void {
    if (!this.tempWireGraphic) return;

    this.tempWireGraphic.clear();

    // Calculate routed path for temporary wire
    const routedPath = this.calculateRoutedPath(startPos, currentPos);

    // Draw with dashed line style
    this.tempWireGraphic.moveTo(routedPath[0].x, routedPath[0].y);
    for (let i = 1; i < routedPath.length; i++) {
      this.tempWireGraphic.lineTo(routedPath[i].x, routedPath[i].y);
    }
    this.tempWireGraphic.stroke({
      width: 3,
      color: this.tempWireColor,
      cap: "round",
      join: "round",
    });

    // Draw dashed effect by creating small gaps
    routedPath.forEach((point, index) => {
      if (index % 2 === 0) {
        this.tempWireGraphic!.circle(point.x, point.y, 2);
        this.tempWireGraphic!.fill(this.tempWireColor);
      }
    });
  }

  /**
   * Clear temporary wire
   */
  public clearTempWire(): void {
    if (this.tempWireGraphic) {
      this.wireContainer.removeChild(this.tempWireGraphic);
      this.tempWireGraphic.destroy();
      this.tempWireGraphic = null;
    }
  }

  /**
   * Calculate routed path with obstacle avoidance (from reference implementation)
   */
  private calculateRoutedPath(
    startPos: { x: number; y: number },
    endPos: { x: number; y: number },
    startPinId?: string,
    endPinId?: string
  ): { x: number; y: number }[] {
    // Extract component IDs from pin IDs to exclude their obstacles
    const startComponentId = startPinId
      ? startPinId.replace(/-pin\d+$/, "")
      : null;
    const endComponentId = endPinId ? endPinId.replace(/-pin\d+$/, "") : null;
    const excludedComponentIds = new Set(
      [startComponentId, endComponentId].filter(Boolean)
    );

    // Create obstacles for routing (excluding start/end components)
    const obstacles = Array.from(this.components.values())
      .filter((comp) => !excludedComponentIds.has(comp.getName()))
      .map((comp) => {
        const pos = comp.getPosition();
        return {
          x: pos.x - this.COMPONENT_BASE_WIDTH / 2 - this.COMPONENT_PADDING,
          y: pos.y - this.COMPONENT_BASE_HEIGHT / 2 - this.COMPONENT_PADDING,
          width: this.COMPONENT_BASE_WIDTH + this.COMPONENT_PADDING * 2,
          height: this.COMPONENT_BASE_HEIGHT + this.COMPONENT_PADDING * 2,
          componentId: comp.getName(),
        };
      });

    return this.findManhattanPath(startPos, endPos, obstacles);
  }

  /**
   * Enhanced Manhattan pathfinding from reference implementation
   */
  private findManhattanPath(
    startPos: { x: number; y: number },
    endPos: { x: number; y: number },
    obstacles: any[]
  ): { x: number; y: number }[] {
    // Check if direct path is clear
    if (!this.lineIntersectsObstacles(startPos, endPos, obstacles)) {
      return [startPos, endPos];
    }

    // Try L-shaped paths
    const horizontalMid = { x: endPos.x, y: startPos.y };
    if (
      !this.pointInObstacles(horizontalMid, obstacles) &&
      !this.lineIntersectsObstacles(startPos, horizontalMid, obstacles) &&
      !this.lineIntersectsObstacles(horizontalMid, endPos, obstacles)
    ) {
      return [startPos, horizontalMid, endPos];
    }

    const verticalMid = { x: startPos.x, y: endPos.y };
    if (
      !this.pointInObstacles(verticalMid, obstacles) &&
      !this.lineIntersectsObstacles(startPos, verticalMid, obstacles) &&
      !this.lineIntersectsObstacles(verticalMid, endPos, obstacles)
    ) {
      return [startPos, verticalMid, endPos];
    }

    // Try detour routes
    const minOffset = 120;

    // Top detour
    const topRoute = [
      startPos,
      { x: endPos.x, y: startPos.y - minOffset },
      endPos,
    ];

    if (
      !this.lineIntersectsObstacles(startPos, topRoute[1], obstacles) &&
      !this.lineIntersectsObstacles(topRoute[1], endPos, obstacles)
    ) {
      return topRoute;
    }

    // Bottom detour
    const bottomRoute = [
      startPos,
      { x: endPos.x, y: startPos.y + minOffset },
      endPos,
    ];

    if (
      !this.lineIntersectsObstacles(startPos, bottomRoute[1], obstacles) &&
      !this.lineIntersectsObstacles(bottomRoute[1], endPos, obstacles)
    ) {
      return bottomRoute;
    }

    // Left detour
    const leftRoute = [
      startPos,
      { x: startPos.x - minOffset, y: endPos.y },
      endPos,
    ];

    if (
      !this.lineIntersectsObstacles(startPos, leftRoute[1], obstacles) &&
      !this.lineIntersectsObstacles(leftRoute[1], endPos, obstacles)
    ) {
      return leftRoute;
    }

    // Right detour
    const rightRoute = [
      startPos,
      { x: startPos.x + minOffset, y: endPos.y },
      endPos,
    ];

    if (
      !this.lineIntersectsObstacles(startPos, rightRoute[1], obstacles) &&
      !this.lineIntersectsObstacles(rightRoute[1], endPos, obstacles)
    ) {
      return rightRoute;
    }

    // Fallback to preferred L-shape
    const dx = Math.abs(endPos.x - startPos.x);
    const dy = Math.abs(endPos.y - startPos.y);

    return dx > dy
      ? [startPos, horizontalMid, endPos]
      : [startPos, verticalMid, endPos];
  }

  /**
   * Check if point is inside any obstacle
   */
  private pointInObstacles(
    point: { x: number; y: number },
    obstacles: any[]
  ): boolean {
    return obstacles.some(
      (obstacle) =>
        point.x >= obstacle.x &&
        point.x <= obstacle.x + obstacle.width &&
        point.y >= obstacle.y &&
        point.y <= obstacle.y + obstacle.height
    );
  }

  /**
   * Check if line intersects any obstacles
   */
  private lineIntersectsObstacles(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    obstacles: any[]
  ): boolean {
    return obstacles.some((obstacle) =>
      this.lineIntersectsRect(p1, p2, obstacle)
    );
  }

  /**
   * Check if line intersects rectangle
   */
  private lineIntersectsRect(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    rect: any
  ): boolean {
    // Check if either endpoint is inside rectangle
    if (this.pointInRect(p1, rect) || this.pointInRect(p2, rect)) {
      return true;
    }

    const { x: rx, y: ry, width: rw, height: rh } = rect;

    // Check intersection with each edge of the rectangle
    const edges = [
      { x1: rx, y1: ry, x2: rx + rw, y2: ry }, // Top edge
      { x1: rx + rw, y1: ry, x2: rx + rw, y2: ry + rh }, // Right edge
      { x1: rx + rw, y1: ry + rh, x2: rx, y2: ry + rh }, // Bottom edge
      { x1: rx, y1: ry + rh, x2: rx, y2: ry }, // Left edge
    ];

    return edges.some((edge) =>
      this.linesIntersect(
        p1.x,
        p1.y,
        p2.x,
        p2.y,
        edge.x1,
        edge.y1,
        edge.x2,
        edge.y2
      )
    );
  }

  /**
   * Check if point is inside rectangle
   */
  private pointInRect(point: { x: number; y: number }, rect: any): boolean {
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    );
  }

  /**
   * Check if two lines intersect
   */
  private linesIntersect(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    x4: number,
    y4: number
  ): boolean {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return false; // Lines are parallel

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  /**
   * Update grid reference when grid scale changes
   */
  public updateGridReference(newGridCanvas: GridCanvas): void {
    this.gridCanvas = newGridCanvas;
    console.log("🔄 Wire system grid reference updated");
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    this.clearTempWire();
    this.wires.forEach((wire) => {
      wire.graphics.destroy();
    });
    this.wires.clear();
    this.wireContainer.destroy();
  }
}
