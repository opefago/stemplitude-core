/**
 * Optimized Wire Routing Algorithm
 *
 * Based on industry best practices for schematic routing:
 * - Manhattan (orthogonal) routing with A* pathfinding
 * - Component avoidance using occupancy grids
 * - Post-processing for bend minimization and path optimization
 * - Dynamic rerouting when components move
 * - Multi-layer routing for complex circuits
 */

import { Graphics } from "pixi.js";
import { CircuitComponent } from "./CircuitComponent";

// Keep warnings/errors, silence verbose dev logs for this module.
const console = {
  ...globalThis.console,
  log: (..._args: unknown[]) => {},
};

export interface RoutingPoint {
  x: number;
  y: number;
  layer?: number; // For multi-layer routing
}

export interface WirePath {
  segments: WireSegment[];
  totalLength: number;
  bendCount: number;
  layer: number;
}

export interface WireSegment {
  start: RoutingPoint;
  end: RoutingPoint;
  isHorizontal: boolean;
  layer: number;
}

export interface ComponentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;
}

export interface RoutingGrid {
  width: number;
  height: number;
  cellSize: number;
  occupancy: boolean[][];
  wireLayers: number[][]; // Track which layer has wires
}

export interface RoutingOptions {
  // Core routing preferences
  preferOrthogonal: boolean;
  minimizeBends: boolean;
  minimizeLength: boolean;
  avoidComponents: boolean;

  // Advanced options
  enableMultiLayer: boolean;
  maxLayers: number;
  layerSpacing: number;

  // Optimization settings
  enablePostProcessing: boolean;
  mergeCollinearSegments: boolean;
  snapToGrid: boolean;
  gridResolution: number;

  // Performance settings
  maxSearchIterations: number;
  enableCaching: boolean;
  cacheExpiry: number;
}

/**
 * Advanced wire routing system with multiple optimization strategies
 */
export class OptimizedWireRouter {
  private grid: RoutingGrid;
  private components: Map<string, CircuitComponent>;
  private componentBounds: Map<string, ComponentBounds>;
  private routingCache: Map<string, WirePath>;
  private lastCacheCleanup: number;

  private options: RoutingOptions;

  constructor(
    gridWidth: number,
    gridHeight: number,
    cellSize: number = 10,
    options: Partial<RoutingOptions> = {}
  ) {
    this.grid = {
      width: gridWidth,
      height: gridHeight,
      cellSize,
      occupancy: Array(gridHeight)
        .fill(null)
        .map(() => Array(gridWidth).fill(false)),
      wireLayers: Array(gridHeight)
        .fill(null)
        .map(() => Array(gridWidth).fill(0)),
    };

    this.components = new Map();
    this.componentBounds = new Map();
    this.routingCache = new Map();
    this.lastCacheCleanup = Date.now();

    this.options = {
      preferOrthogonal: true,
      minimizeBends: true,
      minimizeLength: true,
      avoidComponents: true,
      enableMultiLayer: false,
      maxLayers: 3,
      layerSpacing: 2,
      enablePostProcessing: true,
      mergeCollinearSegments: true,
      snapToGrid: true,
      gridResolution: 10,
      maxSearchIterations: 10000,
      enableCaching: true,
      cacheExpiry: 5000, // 5 seconds
      ...options,
    };
  }

  /**
   * Main routing method - finds optimal path between two points
   */
  public routeWire(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponents: string[] = []
  ): WirePath {
    const cacheKey = this.generateCacheKey(start, end, avoidComponents);

    // Check cache first
    if (this.options.enableCaching && this.routingCache.has(cacheKey)) {
      const cached = this.routingCache.get(cacheKey)!;
      if (Date.now() - this.lastCacheCleanup < this.options.cacheExpiry) {
        return cached;
      }
    }

    // Clean up old cache entries
    this.cleanupCache();

    // Update component occupancy
    this.updateComponentOccupancy();

    // Find optimal path using multiple strategies
    let path: WirePath;

    if (this.options.enableMultiLayer) {
      path = this.routeMultiLayer(start, end, avoidComponents);
    } else {
      path = this.routeSingleLayer(start, end, avoidComponents);
    }

    // Post-process the path for optimization
    if (this.options.enablePostProcessing) {
      path = this.optimizePath(path);
    }

    // Cache the result
    if (this.options.enableCaching) {
      this.routingCache.set(cacheKey, path);
    }

    return path;
  }

  /**
   * Single-layer routing using A* with Manhattan distance
   */
  private routeSingleLayer(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponents: string[]
  ): WirePath {
    this.ensureRoutingGridFitsRoute(start, end);
    const gridStart = this.worldToGrid(start);
    const gridEnd = this.worldToGrid(end);

    const rawPath = this.findAStarWithRetries(
      gridStart,
      gridEnd,
      avoidComponents,
      [start, end],
    );
    console.log(`🔍 A* pathfinding result: ${rawPath.length} points`);
    console.log(
      `🔍 Grid start: (${gridStart.x}, ${gridStart.y}), Grid end: (${gridEnd.x}, ${gridEnd.y})`
    );

    if (rawPath.length === 0) {
      console.log(`⚠️ No path found segments`, { start, end });
      return this.createDirectPath(start, end);
    }

    // Convert to wire segments
    const segments = this.pathToSegments(rawPath, 0);

    return {
      segments,
      totalLength: this.calculatePathLength(segments),
      bendCount: this.countBends(segments),
      layer: 0,
    };
  }

  /**
   * Multi-layer routing for complex circuits
   */
  private routeMultiLayer(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponents: string[]
  ): WirePath {
    let bestPath: WirePath | null = null;
    let bestScore = Infinity;

    // Try routing on each layer
    for (let layer = 0; layer < this.options.maxLayers; layer++) {
      const path = this.routeOnLayer(start, end, avoidComponents, layer);
      const score = this.calculatePathScore(path);

      if (score < bestScore) {
        bestScore = score;
        bestPath = path;
      }
    }

    return bestPath || this.createDirectPath(start, end);
  }

  /**
   * Route on a specific layer
   */
  private routeOnLayer(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponents: string[],
    layer: number
  ): WirePath {
    this.ensureRoutingGridFitsRoute(start, end);
    const gridStart = this.worldToGrid(start);
    const gridEnd = this.worldToGrid(end);

    const rawPath = this.findAStarLayerWithRetries(
      gridStart,
      gridEnd,
      avoidComponents,
      layer,
      [start, end],
    );

    if (rawPath.length === 0) {
      return this.createDirectPath(start, end);
    }

    const segments = this.pathToSegments(rawPath, layer);

    return {
      segments,
      totalLength: this.calculatePathLength(segments),
      bendCount: this.countBends(segments),
      layer,
    };
  }

  /**
   * A* pathfinding algorithm with optimizations and outside routing preference
   */
  private findAStarPath(
    start: RoutingPoint,
    end: RoutingPoint,
    occupancy: boolean[][]
  ): RoutingPoint[] {
    interface AStarNode {
      x: number;
      y: number;
      g: number; // Cost from start
      h: number; // Heuristic to end
      f: number; // Total cost
      parent: AStarNode | null;
      directionFromParent?: string; // Track direction from parent
    }

    const openSet: AStarNode[] = [];
    const closedSet = new Set<string>();
    const iterations = { count: 0 };

    const startNode: AStarNode = {
      x: start.x,
      y: start.y,
      g: 0,
      h: this.manhattanDistance(start, end),
      f: 0,
      parent: null,
    };
    startNode.f = startNode.g + startNode.h;
    openSet.push(startNode);

    while (
      openSet.length > 0 &&
      iterations.count < this.options.maxSearchIterations
    ) {
      iterations.count++;

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
        return this.reconstructPath(current);
      }

      // Get neighbors with enhanced routing preferences
      const neighbors = this.getEnhancedNeighbors(
        current,
        occupancy,
        start,
        end
      );


      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;

        if (closedSet.has(neighborKey)) continue;

        // Calculate enhanced cost with outside routing preference
        const baseCost = 1;
        const outsideRoutingBonus = this.calculateOutsideRoutingBonus(
          current,
          neighbor,
          start,
          end
        );
        const componentAvoidancePenalty =
          this.calculateComponentAvoidancePenalty(neighbor, occupancy);
        const directionChangePenalty = this.calculateDirectionChangePenalty(
          current,
          neighbor
        );

        const g =
          current.g +
          baseCost -
          outsideRoutingBonus +
          componentAvoidancePenalty +
          directionChangePenalty;
        const h = this.manhattanDistance(neighbor, end);
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
            directionFromParent: this.getDirectionFromParent(current, neighbor),
          });
        } else if (g < openSet[existingIndex].g) {
          // Better path to existing node
          openSet[existingIndex].g = g;
          openSet[existingIndex].f = f;
          openSet[existingIndex].parent = current;
          openSet[existingIndex].directionFromParent =
            this.getDirectionFromParent(current, neighbor);
        }
      }
    }

    return []; // No path found
  }

  /**
   * Get enhanced neighbors with outside routing preference
   */
  private getEnhancedNeighbors(
    node: { x: number; y: number },
    occupancy: boolean[][],
    start: RoutingPoint,
    end: RoutingPoint
  ): RoutingPoint[] {
    const neighbors: RoutingPoint[] = [];

    // Safety check for occupancy grid
    if (!occupancy || !Array.isArray(occupancy)) {
      return [];
    }

    // Calculate the general direction from start to end
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const isHorizontal = Math.abs(dx) > Math.abs(dy);

    // Prioritize directions that go "around" components rather than through them
    const directions = this.getPrioritizedDirections(
      node,
      start,
      end,
      isHorizontal
    );

    for (const dir of directions) {
      const x = node.x + dir.x;
      const y = node.y + dir.y;

      // Check bounds
      if (x < 0 || x >= this.grid.width || y < 0 || y >= this.grid.height) {
        continue;
      }

      // Check occupancy with safety checks
      if (occupancy && occupancy[y] && occupancy[y][x]) {
        continue;
      }

      neighbors.push({ x, y, layer: 0 });
    }

    return neighbors;
  }

  /**
   * Get orthogonal neighbors for A* search (fallback)
   */
  private getOrthogonalNeighbors(
    node: { x: number; y: number },
    occupancy: boolean[][]
  ): RoutingPoint[] {
    const neighbors: RoutingPoint[] = [];

    // Safety check for occupancy grid
    if (!occupancy || !Array.isArray(occupancy)) {
      console.warn("⚠️ Invalid occupancy grid in getOrthogonalNeighbors");
      return [];
    }
    const directions = [
      { x: 1, y: 0 }, // Right
      { x: -1, y: 0 }, // Left
      { x: 0, y: 1 }, // Down
      { x: 0, y: -1 }, // Up
    ];

    for (const dir of directions) {
      const x = node.x + dir.x;
      const y = node.y + dir.y;

      // Check bounds
      if (x < 0 || x >= this.grid.width || y < 0 || y >= this.grid.height) {
        continue;
      }

      // Check occupancy with safety checks
      if (occupancy && occupancy[y] && occupancy[y][x]) {
        continue;
      }

      neighbors.push({ x, y, layer: 0 });
    }

    return neighbors;
  }

  /**
   * Get prioritized directions for outside routing
   */
  private getPrioritizedDirections(
    node: { x: number; y: number },
    start: RoutingPoint,
    end: RoutingPoint,
    isHorizontal: boolean
  ): { x: number; y: number; priority: number }[] {
    const directions = [
      { x: 1, y: 0, priority: 0 }, // Right
      { x: -1, y: 0, priority: 0 }, // Left
      { x: 0, y: 1, priority: 0 }, // Down
      { x: 0, y: -1, priority: 0 }, // Up
    ];

    // Calculate which side of the start-end line we're on
    const lineSide = this.getLineSide(node, start, end);

    // Prioritize directions that go "around" rather than "through"
    if (isHorizontal) {
      // For horizontal connections, prefer vertical movement to go around
      if (lineSide > 0) {
        // Above the line, prefer up and right
        directions[0].priority = 1; // Right
        directions[3].priority = 2; // Up
        directions[2].priority = 3; // Down
        directions[1].priority = 4; // Left
      } else {
        // Below the line, prefer down and right
        directions[0].priority = 1; // Right
        directions[2].priority = 2; // Down
        directions[3].priority = 3; // Up
        directions[1].priority = 4; // Left
      }
    } else {
      // For vertical connections, prefer horizontal movement to go around
      if (lineSide > 0) {
        // Right of the line, prefer right and up
        directions[0].priority = 1; // Right
        directions[3].priority = 2; // Up
        directions[2].priority = 3; // Down
        directions[1].priority = 4; // Left
      } else {
        // Left of the line, prefer left and up
        directions[1].priority = 1; // Left
        directions[3].priority = 2; // Up
        directions[2].priority = 3; // Down
        directions[0].priority = 4; // Right
      }
    }

    // Sort by priority (lower is better)
    return directions.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Calculate which side of the start-end line a point is on
   */
  private getLineSide(
    point: { x: number; y: number },
    start: RoutingPoint,
    end: RoutingPoint
  ): number {
    return (
      (end.x - start.x) * (point.y - start.y) -
      (end.y - start.y) * (point.x - start.x)
    );
  }

  /**
   * Calculate bonus for outside routing (negative cost = bonus)
   */
  private calculateOutsideRoutingBonus(
    current: { x: number; y: number },
    neighbor: RoutingPoint,
    start: RoutingPoint,
    end: RoutingPoint
  ): number {
    // Bonus for moving away from the direct line (encourages going around)
    const directDistance = this.distanceToLine(neighbor, start, end);
    const currentDirectDistance = this.distanceToLine(current, start, end);

    // If we're moving further from the direct line, give a bonus
    if (directDistance > currentDirectDistance) {
      return 1.1; // Prefer routing outside the pin-to-pin chord (schematic style)
    }

    return 0;
  }

  /**
   * Calculate penalty for being too close to components
   */
  private calculateComponentAvoidancePenalty(
    neighbor: RoutingPoint,
    occupancy: boolean[][]
  ): number {
    let penalty = 0;

    // Check surrounding cells for component proximity
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = neighbor.x + dx;
        const y = neighbor.y + dy;

        if (x >= 0 && x < this.grid.width && y >= 0 && y < this.grid.height) {
          if (occupancy[y][x]) {
            // Penalty increases with proximity to components
            const distance = Math.sqrt(dx * dx + dy * dy);
            penalty += 1.0 / (distance + 1);
          }
        }
      }
    }

    return penalty;
  }

  /**
   * Calculate penalty for direction changes (encourages straight lines)
   */
  private calculateDirectionChangePenalty(
    current: { x: number; y: number },
    neighbor: RoutingPoint
  ): number {
    // This would need the parent's direction to calculate properly
    // For now, return 0 as direction tracking is handled elsewhere
    return 0;
  }

  /**
   * Get direction from parent to current node
   */
  private getDirectionFromParent(
    parent: { x: number; y: number },
    current: RoutingPoint
  ): string {
    const dx = current.x - parent.x;
    const dy = current.y - parent.y;

    if (dx > 0) return "right";
    if (dx < 0) return "left";
    if (dy > 0) return "down";
    if (dy < 0) return "up";
    return "none";
  }

  /**
   * Calculate distance from a point to a line segment
   */
  private distanceToLine(
    point: RoutingPoint,
    lineStart: RoutingPoint,
    lineEnd: RoutingPoint
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
   * Post-processing optimization to minimize bends and length
   */
  private optimizePath(path: WirePath): WirePath {
    let optimized = { ...path };

    if (this.options.mergeCollinearSegments) {
      optimized = this.mergeCollinearSegments(optimized);
    }

    if (this.options.minimizeBends) {
      optimized = this.minimizeBends(optimized);
    }

    if (this.options.minimizeLength) {
      optimized = this.minimizeLength(optimized);
    }

    return optimized;
  }

  /**
   * Merge collinear segments to reduce complexity
   */
  private mergeCollinearSegments(path: WirePath): WirePath {
    if (path.segments.length <= 1) return path;

    const merged: WireSegment[] = [];
    let current = path.segments[0];

    for (let i = 1; i < path.segments.length; i++) {
      const next = path.segments[i];

      // Check if segments are collinear and can be merged
      if (this.canMergeSegments(current, next)) {
        current = {
          start: current.start,
          end: next.end,
          isHorizontal: current.isHorizontal,
          layer: current.layer,
        };
      } else {
        merged.push(current);
        current = next;
      }
    }

    merged.push(current);

    return {
      segments: merged,
      totalLength: this.calculatePathLength(merged),
      bendCount: this.countBends(merged),
      layer: path.layer,
    };
  }

  /**
   * Minimize bends using local optimization
   */
  private minimizeBends(path: WirePath): WirePath {
    // Implementation would involve local search to reduce unnecessary bends
    // This is a simplified version - full implementation would be more complex
    return path;
  }

  /**
   * Minimize total wire length
   */
  private minimizeLength(path: WirePath): WirePath {
    // Implementation would involve local optimization to reduce wire length
    // This is a simplified version - full implementation would be more complex
    return path;
  }

  private resizeRoutingGrid(newWidth: number, newHeight: number): void {
    const w = Math.max(this.grid.width, Math.ceil(newWidth));
    const h = Math.max(this.grid.height, Math.ceil(newHeight));
    if (w === this.grid.width && h === this.grid.height) return;
    this.grid.width = w;
    this.grid.height = h;
    this.grid.occupancy = Array(h)
      .fill(null)
      .map(() => Array(w).fill(false));
    this.grid.wireLayers = Array(h)
      .fill(null)
      .map(() => Array(w).fill(0));
    this.routingCache.clear();
  }

  /** Grow the logical grid so pin indices are in-range for large schematics. */
  private ensureRoutingGridFitsRoute(
    start: RoutingPoint,
    end: RoutingPoint,
  ): void {
    let maxX = Math.max(start.x, end.x);
    let maxY = Math.max(start.y, end.y);
    this.componentBounds.forEach((b) => {
      maxX = Math.max(maxX, b.x + b.width + b.padding);
      maxY = Math.max(maxY, b.y + b.height + b.padding);
    });
    const cell = this.grid.cellSize;
    const margin = cell * 10;
    const needW = Math.ceil((maxX + margin) / cell) + 3;
    const needH = Math.ceil((maxY + margin) / cell) + 3;
    this.resizeRoutingGrid(needW, needH);
  }

  private findAStarWithRetries(
    gridStart: RoutingPoint,
    gridEnd: RoutingPoint,
    avoid: string[],
    access: RoutingPoint[],
  ): RoutingPoint[] {
    const attempts: {
      paddingScale?: number;
      portalExtraCells?: number;
    }[] = [{}, { paddingScale: 0.5, portalExtraCells: 4 }, { paddingScale: 0.28, portalExtraCells: 8 }];
    for (const o of attempts) {
      const occ = this.createOccupancyGrid(avoid, access, o);
      const path = this.findAStarPath(gridStart, gridEnd, occ);
      if (path.length > 0) return path;
    }
    return [];
  }

  private findAStarLayerWithRetries(
    gridStart: RoutingPoint,
    gridEnd: RoutingPoint,
    avoid: string[],
    layer: number,
    access: RoutingPoint[],
  ): RoutingPoint[] {
    const attempts: {
      paddingScale?: number;
      portalExtraCells?: number;
    }[] = [{}, { paddingScale: 0.5, portalExtraCells: 4 }, { paddingScale: 0.28, portalExtraCells: 8 }];
    for (const o of attempts) {
      const occ = this.createLayerOccupancyGrid(avoid, layer, access, o);
      const path = this.findAStarPath(gridStart, gridEnd, occ);
      if (path.length > 0) return path;
    }
    return [];
  }

  /**
   * Open a small Manhattan neighborhood in grid space so A* can enter/leave pins
   * while every symbol body remains blocked.
   */
  private carvePinAccessPortals(
    occupancy: boolean[][],
    worldPoints: RoutingPoint[],
    extraCells = 0,
  ): void {
    if (!worldPoints.length) return;
    const rCells =
      Math.max(3, Math.ceil(64 / this.grid.cellSize)) + Math.max(0, extraCells);
    for (const p of worldPoints) {
      const g = this.worldToGrid(p);
      for (let dy = -rCells; dy <= rCells; dy++) {
        for (let dx = -rCells; dx <= rCells; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > rCells) continue;
          const x = g.x + dx;
          const y = g.y + dy;
          if (
            x >= 0 &&
            x < this.grid.width &&
            y >= 0 &&
            y < this.grid.height
          ) {
            occupancy[y][x] = false;
          }
        }
      }
    }
  }

  /**
   * Create occupancy grid for component avoidance.
   * All components block cells; `accessWorldPoints` carve portals at route endpoints (pins).
   */
  private createOccupancyGrid(
    _avoidComponents: string[],
    accessWorldPoints: RoutingPoint[] = [],
    occOpts?: { paddingScale?: number; portalExtraCells?: number },
  ): boolean[][] {
    const padMul = occOpts?.paddingScale ?? 1;
    const portalExtra = occOpts?.portalExtraCells ?? 0;
    const occupancy = Array(this.grid.height)
      .fill(null)
      .map(() => Array(this.grid.width).fill(false));

    this.componentBounds.forEach((bounds) => {
      const pad = bounds.padding * padMul;
      const gridStart = this.worldToGrid({
        x: bounds.x - pad,
        y: bounds.y - pad,
      });
      const gridEnd = this.worldToGrid({
        x: bounds.x + bounds.width + pad,
        y: bounds.y + bounds.height + pad,
      });

      for (
        let y = Math.max(0, gridStart.y);
        y <= Math.min(this.grid.height - 1, gridEnd.y);
        y++
      ) {
        for (
          let x = Math.max(0, gridStart.x);
          x <= Math.min(this.grid.width - 1, gridEnd.x);
          x++
        ) {
          occupancy[y][x] = true;
        }
      }
    });

    this.carvePinAccessPortals(occupancy, accessWorldPoints);

    return occupancy;
  }

  /**
   * Create layer-specific occupancy grid
   */
  private createLayerOccupancyGrid(
    avoidComponents: string[],
    layer: number,
    accessWorldPoints: RoutingPoint[] = [],
    occOpts?: { paddingScale?: number; portalExtraCells?: number },
  ): boolean[][] {
    const occupancy = this.createOccupancyGrid(
      avoidComponents,
      accessWorldPoints,
      occOpts,
    );

    // Also mark existing wires on this layer as occupied
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        if (this.grid.wireLayers[y][x] === layer) {
          occupancy[y][x] = true;
        }
      }
    }

    return occupancy;
  }

  /**
   * Convert grid path to wire segments (strictly orthogonal — one segment per straight grid run).
   * Previous implementation compared each point to the *run origin*, which turned L-paths into
   * a single diagonal once |Δx| and |Δy| were both non-zero.
   */
  private pathToSegments(path: RoutingPoint[], layer: number): WireSegment[] {
    if (path.length < 2) return [];

    const segments: WireSegment[] = [];
    let runStart = path[0]!;
    let runDir: "horizontal" | "vertical" | null = null;

    const pushSeg = (
      a: RoutingPoint,
      b: RoutingPoint,
      horiz: boolean,
    ) => {
      const startWorld = this.gridToWorld(a);
      const endWorld = this.gridToWorld(b);
      if (
        Math.abs(endWorld.x - startWorld.x) < 1e-6 &&
        Math.abs(endWorld.y - startWorld.y) < 1e-6
      ) {
        return;
      }
      segments.push({
        start: startWorld,
        end: endWorld,
        isHorizontal: horiz,
        layer,
      });
    };

    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1]!;
      const cur = path[i]!;
      const ddx = cur.x - prev.x;
      const ddy = cur.y - prev.y;
      if (ddx === 0 && ddy === 0) continue;

      let stepDir: "horizontal" | "vertical";
      if (ddx !== 0 && ddy !== 0) {
        stepDir = Math.abs(ddx) >= Math.abs(ddy) ? "horizontal" : "vertical";
      } else if (ddx !== 0) {
        stepDir = "horizontal";
      } else {
        stepDir = "vertical";
      }

      if (runDir === null) {
        runDir = stepDir;
      } else if (stepDir !== runDir) {
        pushSeg(runStart, prev, runDir === "horizontal");
        runStart = prev;
        runDir = stepDir;
      }
    }

    const last = path[path.length - 1]!;
    if (runDir !== null) {
      pushSeg(runStart, last, runDir === "horizontal");
    }

    return segments;
  }

  /**
   * Utility methods
   */
  private worldToGrid(point: RoutingPoint): RoutingPoint {
    console.log(
      `🔍 worldToGrid: point=(${point.x}, ${point.y}), cellSize=${this.grid.cellSize}`
    );
    const result = {
      x: Math.round(point.x / this.grid.cellSize),
      y: Math.round(point.y / this.grid.cellSize),
      layer: point.layer,
    };
    console.log(`🔍 worldToGrid result: (${result.x}, ${result.y})`);
    return result;
  }

  private gridToWorld(point: RoutingPoint): RoutingPoint {
    return {
      x: point.x * this.grid.cellSize,
      y: point.y * this.grid.cellSize,
      layer: point.layer,
    };
  }

  private manhattanDistance(a: RoutingPoint, b: RoutingPoint): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  private calculatePathLength(segments: WireSegment[]): number {
    return segments.reduce((total, segment) => {
      const dx = segment.end.x - segment.start.x;
      const dy = segment.end.y - segment.start.y;
      return total + Math.sqrt(dx * dx + dy * dy);
    }, 0);
  }

  private countBends(segments: WireSegment[]): number {
    if (segments.length <= 1) return 0;

    let bends = 0;
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].isHorizontal !== segments[i - 1].isHorizontal) {
        bends++;
      }
    }
    return bends;
  }

  private calculatePathScore(path: WirePath): number {
    // Weighted scoring function
    const lengthWeight = 1.0;
    const bendWeight = 2.0;
    const layerWeight = 0.5;

    return (
      path.totalLength * lengthWeight +
      path.bendCount * bendWeight +
      path.layer * layerWeight
    );
  }

  private canMergeSegments(seg1: WireSegment, seg2: WireSegment): boolean {
    return (
      seg1.isHorizontal === seg2.isHorizontal &&
      seg1.layer === seg2.layer &&
      seg1.end.x === seg2.start.x &&
      seg1.end.y === seg2.start.y
    );
  }

  private reconstructPath(node: any): RoutingPoint[] {
    const path: RoutingPoint[] = [];
    let current: any = node;

    while (current) {
      path.unshift({ x: current.x, y: current.y, layer: 0 });
      current = current.parent;
    }

    return path;
  }

  /**
   * When A* fails, still return a schematic-style orthogonal path (never a diagonal slash).
   * Uses a simple L / single-bend Manhattan route between endpoints.
   */
  private createDirectPath(start: RoutingPoint, end: RoutingPoint): WirePath {
    const x0 = start.x;
    const y0 = start.y;
    const x1 = end.x;
    const y1 = end.y;
    const manhattan = Math.abs(x1 - x0) + Math.abs(y1 - y0);

    if (manhattan < 1e-6) {
      return {
        segments: [],
        totalLength: 0,
        bendCount: 0,
        layer: 0,
      };
    }

    if (Math.abs(y1 - y0) < 1e-6) {
      const segments: WireSegment[] = [
        {
          start: { x: x0, y: y0, layer: 0 },
          end: { x: x1, y: y0, layer: 0 },
          isHorizontal: true,
          layer: 0,
        },
      ];
      return {
        segments,
        totalLength: manhattan,
        bendCount: 0,
        layer: 0,
      };
    }

    if (Math.abs(x1 - x0) < 1e-6) {
      const segments: WireSegment[] = [
        {
          start: { x: x0, y: y0, layer: 0 },
          end: { x: x0, y: y1, layer: 0 },
          isHorizontal: false,
          layer: 0,
        },
      ];
      return {
        segments,
        totalLength: manhattan,
        bendCount: 0,
        layer: 0,
      };
    }

    // Prefer the L whose first leg spans the larger delta ("long-leg-first") —
    // tends to route around the outside of the pin bbox instead of cutting inward.
    const adx = Math.abs(x1 - x0);
    const ady = Math.abs(y1 - y0);
    const horizontalFirst = adx >= ady;
    const segments: WireSegment[] = horizontalFirst
      ? [
          {
            start: { x: x0, y: y0, layer: 0 },
            end: { x: x1, y: y0, layer: 0 },
            isHorizontal: true,
            layer: 0,
          },
          {
            start: { x: x1, y: y0, layer: 0 },
            end: { x: x1, y: y1, layer: 0 },
            isHorizontal: false,
            layer: 0,
          },
        ]
      : [
          {
            start: { x: x0, y: y0, layer: 0 },
            end: { x: x0, y: y1, layer: 0 },
            isHorizontal: false,
            layer: 0,
          },
          {
            start: { x: x0, y: y1, layer: 0 },
            end: { x: x1, y: y1, layer: 0 },
            isHorizontal: true,
            layer: 0,
          },
        ];

    return {
      segments,
      totalLength: manhattan,
      bendCount: 1,
      layer: 0,
    };
  }

  private generateCacheKey(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponents: string[]
  ): string {
    return `${start.x},${start.y}-${end.x},${end.y}-${avoidComponents.sort().join(",")}`;
  }

  private cleanupCache(): void {
    const now = Date.now();
    if (now - this.lastCacheCleanup > this.options.cacheExpiry) {
      this.routingCache.clear();
      this.lastCacheCleanup = now;
    }
  }

  private updateComponentOccupancy(): void {
    // Update component bounds and occupancy grid
    this.componentBounds.clear();

    this.components.forEach((component, id) => {
      const displayObject = component.displayObject();
      try {
        displayObject.updateLocalTransform();
      } catch {
        /* no-op */
      }
      const b = displayObject.getBounds();
      const pos = component.getPosition();
      const valid =
        Number.isFinite(b.x) &&
        Number.isFinite(b.y) &&
        b.width > 2 &&
        b.height > 2;
      const width = valid ? b.width : 88;
      const height = valid ? b.height : 72;
      const x = valid ? b.x : pos.x - width * 0.5;
      const y = valid ? b.y : pos.y - height * 0.5;

      this.componentBounds.set(id, {
        x,
        y,
        width: Math.max(width, 8),
        height: Math.max(height, 8),
        padding: 48,
      });
    });
  }

  /**
   * Public API methods
   */
  public addComponent(component: CircuitComponent): void {
    this.components.set(component.getName(), component);
  }

  public removeComponent(componentId: string): void {
    this.components.delete(componentId);
    this.componentBounds.delete(componentId);
  }

  public updateComponent(component: CircuitComponent): void {
    this.components.set(component.getName(), component);
  }

  public clearCache(): void {
    this.routingCache.clear();
  }

  public setOptions(options: Partial<RoutingOptions>): void {
    this.options = { ...this.options, ...options };
  }

  public updateComponentPosition(
    componentId: string,
    x: number,
    y: number
  ): void {
    const component = this.components.get(componentId);
    if (component) {
      component.setPosition(x, y);
      this.updateComponentOccupancy();
    }
  }

  public clear(): void {
    this.components.clear();
    this.componentBounds.clear();
    this.routingCache.clear();
  }
}
