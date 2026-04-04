import { CircuitComponent } from "./CircuitComponent";
import { WirePath, RoutingPoint, WireSegment } from "./OptimizedWireRouter";

// Keep warnings/errors, silence verbose dev logs for this module.
const console = {
  ...globalThis.console,
  log: (..._args: unknown[]) => {},
};

/**
 * Custom Orthogonal Wire Router
 * Creates clean L-shaped and Z-shaped wires with collision detection
 *
 * Features:
 * - L-shaped routing (horizontal then vertical, or vertical then horizontal)
 * - Z-shaped routing for complex paths
 * - Collision detection with component bounding boxes
 * - Lightweight and optimized for PixiJS integration
 */
export class OrthogonalWireRouter {
  private components: Map<string, CircuitComponent>;
  private gridSize: number;

  constructor(gridSize: number = 10) {
    this.components = new Map();
    this.gridSize = gridSize;
  }

  /**
   * Add a component to the routing system
   */
  public addComponent(component: CircuitComponent): void {
    const componentId = component.getName();
    this.components.set(componentId, component);
    console.log(`🔌 Added component ${componentId} to OrthogonalWireRouter`);
  }

  /**
   * Remove a component from the routing system
   */
  public removeComponent(componentId: string): void {
    this.components.delete(componentId);
    console.log(
      `🗑️ Removed component ${componentId} from OrthogonalWireRouter`
    );
  }

  /**
   * Route a wire between two points using intelligent routing strategy
   */
  public routeWire(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponents: string[] = []
  ): WirePath {
    console.log(
      `🔧 OrthogonalWireRouter: Routing from (${start.x}, ${start.y}) to (${end.x}, ${end.y})`
    );

    // First escape from hosting components so we don't run through them
    const preSegments: WireSegment[] = [];
    const startEscape = this.escapeFromHostingComponent(start);
    if (startEscape.stub) preSegments.push(startEscape.stub);
    const endEscape = this.escapeFromHostingComponent(end);

    const dx = endEscape.escaped.x - startEscape.escaped.x;
    const dy = endEscape.escaped.y - startEscape.escaped.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Define thresholds for different routing strategies
    const STRAIGHT_LINE_THRESHOLD = 50; // pixels - very close components
    const L_SHAPED_THRESHOLD = 200; // pixels - medium distance components

    // Check if components are very close for straight line
    if (
      distance <= STRAIGHT_LINE_THRESHOLD &&
      !this.hasCollisions(
        startEscape.escaped,
        endEscape.escaped,
        avoidComponents
      )
    ) {
      console.log(
        `🔧 Components very close (${distance.toFixed(2)}px), using straight line`
      );
      let segments = this.createStraightLineRoute(
        startEscape.escaped,
        endEscape.escaped
      );
      if (preSegments.length) segments = [...preSegments, ...segments];
      if (endEscape.stub) segments.push(endEscape.stub);
      return {
        segments,
        totalLength: this.calculatePathLength(segments),
        bendCount: this.countBends(segments),
        layer: 0,
      };
    }

    // Check if components are medium distance for L-shaped routing
    if (
      distance <= L_SHAPED_THRESHOLD &&
      !this.hasCollisions(
        startEscape.escaped,
        endEscape.escaped,
        avoidComponents
      )
    ) {
      console.log(
        `🔧 Components medium distance (${distance.toFixed(2)}px), using L-shaped routing`
      );
      let segments = this.createLShapedRoute(
        startEscape.escaped,
        endEscape.escaped
      );
      if (preSegments.length) segments = [...preSegments, ...segments];
      if (endEscape.stub) segments.push(endEscape.stub);
      return {
        segments,
        totalLength: this.calculatePathLength(segments),
        bendCount: this.countBends(segments),
        layer: 0,
      };
    }

    // Components are far apart or have collisions, choose between L-shaped and Z-shaped
    console.log(
      `🔧 Components far apart (${distance.toFixed(2)}px) or have collisions, choosing optimal routing`
    );

    // Create multiple routing options for comparison
    const routingOptions = [
      {
        name: "L-shaped",
        segments: this.createLShapedRoute(
          startEscape.escaped,
          endEscape.escaped
        ),
      },
      {
        name: "Z-shaped",
        segments: this.createZShapedRoute(
          startEscape.escaped,
          endEscape.escaped,
          avoidComponents
        ),
      },
      {
        name: "U-shaped",
        segments: this.createUShapedRoute(
          startEscape.escaped,
          endEscape.escaped,
          avoidComponents
        ),
      },
    ];

    // Calculate scores for all routes
    let bestOption = routingOptions[0];
    let bestScore = this.calculateRouteScore(
      bestOption.segments,
      avoidComponents
    );

    console.log(`🔧 Evaluating ${routingOptions.length} routing options:`);

    for (let i = 0; i < routingOptions.length; i++) {
      const option = routingOptions[i];
      const score = this.calculateRouteScore(option.segments, avoidComponents);
      console.log(`🔧 ${option.name} score: ${score.toFixed(2)}`);

      if (score < bestScore) {
        bestScore = score;
        bestOption = option;
      }
    }

    console.log(
      `✅ Using ${bestOption.name} routing (score: ${bestScore.toFixed(2)})`
    );

    // Prepend/append escape stubs
    let finalSegments = bestOption.segments;
    if (preSegments.length) finalSegments = [...preSegments, ...finalSegments];
    if (endEscape.stub) finalSegments.push(endEscape.stub);

    // Force exact node attachment and strictly orthogonal ends
    if (finalSegments.length > 0) {
      finalSegments[0] = {
        ...finalSegments[0],
        start: { x: start.x, y: start.y, layer: 0 },
      };
      finalSegments[finalSegments.length - 1] = {
        ...finalSegments[finalSegments.length - 1],
        end: { x: end.x, y: end.y, layer: 0 },
      };
    }

    const totalLength = this.calculatePathLength(finalSegments);
    const bendCount = this.countBends(finalSegments);

    console.log(
      `✅ OrthogonalWireRouter: Routing complete with ${bestOption.segments.length} segments, ${totalLength.toFixed(2)}px, ${bendCount} bends`
    );

    return {
      segments: finalSegments,
      totalLength,
      bendCount,
      layer: 0,
    };
  }

  // Note: Angled lead generation removed to maintain straight orthogonal wires

  /**
   * If a point lies inside the bounds of any component, create a short stub to exit
   */
  private escapeFromHostingComponent(point: RoutingPoint): {
    escaped: RoutingPoint;
    stub?: WireSegment;
  } {
    for (const [, component] of this.components) {
      const b = component.displayObject().getBounds();
      const rect = {
        x: b.x,
        y: b.y,
        width: Math.max(b.width, 40),
        height: Math.max(b.height, 40),
      };
      if (this.pointInRect(point, rect)) {
        const margin = 10;
        const left = Math.abs(point.x - rect.x);
        const right = Math.abs(rect.x + rect.width - point.x);
        const top = Math.abs(point.y - rect.y);
        const bottom = Math.abs(rect.y + rect.height - point.y);
        const min = Math.min(left, right, top, bottom);
        if (min === left) {
          const escaped: RoutingPoint = {
            x: rect.x - margin,
            y: point.y,
            layer: 0,
          };
          return {
            escaped,
            stub: {
              start: { ...point },
              end: { ...escaped },
              isHorizontal: true,
              layer: 0,
            },
          };
        } else if (min === right) {
          const escaped: RoutingPoint = {
            x: rect.x + rect.width + margin,
            y: point.y,
            layer: 0,
          };
          return {
            escaped,
            stub: {
              start: { ...point },
              end: { ...escaped },
              isHorizontal: true,
              layer: 0,
            },
          };
        } else if (min === top) {
          const escaped: RoutingPoint = {
            x: point.x,
            y: rect.y - margin,
            layer: 0,
          };
          return {
            escaped,
            stub: {
              start: { ...point },
              end: { ...escaped },
              isHorizontal: false,
              layer: 0,
            },
          };
        } else {
          const escaped: RoutingPoint = {
            x: point.x,
            y: rect.y + rect.height + margin,
            layer: 0,
          };
          return {
            escaped,
            stub: {
              start: { ...point },
              end: { ...escaped },
              isHorizontal: false,
              layer: 0,
            },
          };
        }
      }
    }
    return { escaped: point };
  }

  private pointInRect(
    p: RoutingPoint,
    r: { x: number; y: number; width: number; height: number }
  ): boolean {
    return (
      p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
    );
  }

  /**
   * Create a straight line route for close components
   */
  private createStraightLineRoute(
    start: RoutingPoint,
    end: RoutingPoint
  ): WireSegment[] {
    const segments: WireSegment[] = [];

    // Simple straight line connection
    segments.push({
      start: { x: start.x, y: start.y, layer: 0 },
      end: { x: end.x, y: end.y, layer: 0 },
      isHorizontal: Math.abs(end.x - start.x) > Math.abs(end.y - start.y),
      layer: 0,
    });

    console.log(
      `🔧 Created straight line route from (${start.x}, ${start.y}) to (${end.x}, ${end.y})`
    );
    return segments;
  }

  /**
   * Create a U-shaped route for complex routing scenarios
   */
  private createUShapedRoute(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponents: string[]
  ): WireSegment[] {
    const segments: WireSegment[] = [];
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    // Calculate U-shaped routing with offset to avoid obstacles
    const offset = 80; // Base offset for U-shape
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    // Determine U-shape direction based on component positions
    const useVerticalU = Math.abs(dy) > Math.abs(dx);

    if (useVerticalU) {
      // Vertical U-shape: go up/down, then across, then down/up
      const offsetY = start.y + (dy > 0 ? -offset : offset);

      segments.push({
        start: { x: start.x, y: start.y, layer: 0 },
        end: { x: start.x, y: offsetY, layer: 0 },
        isHorizontal: false,
        layer: 0,
      });

      segments.push({
        start: { x: start.x, y: offsetY, layer: 0 },
        end: { x: end.x, y: offsetY, layer: 0 },
        isHorizontal: true,
        layer: 0,
      });

      segments.push({
        start: { x: end.x, y: offsetY, layer: 0 },
        end: { x: end.x, y: end.y, layer: 0 },
        isHorizontal: false,
        layer: 0,
      });
    } else {
      // Horizontal U-shape: go left/right, then up/down, then right/left
      const offsetX = start.x + (dx > 0 ? -offset : offset);

      segments.push({
        start: { x: start.x, y: start.y, layer: 0 },
        end: { x: offsetX, y: start.y, layer: 0 },
        isHorizontal: true,
        layer: 0,
      });

      segments.push({
        start: { x: offsetX, y: start.y, layer: 0 },
        end: { x: offsetX, y: end.y, layer: 0 },
        isHorizontal: false,
        layer: 0,
      });

      segments.push({
        start: { x: offsetX, y: end.y, layer: 0 },
        end: { x: end.x, y: end.y, layer: 0 },
        isHorizontal: true,
        layer: 0,
      });
    }

    console.log(`🔧 Created U-shaped route with ${segments.length} segments`);
    return segments;
  }

  /**
   * Create a cardinal L-shaped route using cardinal directions
   */
  private createLShapedRoute(
    start: RoutingPoint,
    end: RoutingPoint
  ): WireSegment[] {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    // Determine cardinal direction preference
    const cardinalDirection = this.getCardinalDirection(dx, dy);

    console.log(
      `🧭 Cardinal direction: ${cardinalDirection} (dx: ${dx}, dy: ${dy})`
    );

    switch (cardinalDirection) {
      case "EAST":
        // East: Horizontal first, then vertical
        return this.createEastRoute(start, end);
      case "WEST":
        // West: Horizontal first, then vertical
        return this.createWestRoute(start, end);
      case "NORTH":
        // North: Vertical first, then horizontal
        return this.createNorthRoute(start, end);
      case "SOUTH":
        // South: Vertical first, then horizontal
        return this.createSouthRoute(start, end);
      case "NORTHEAST":
        // Northeast: Prefer horizontal first
        return this.createEastRoute(start, end);
      case "NORTHWEST":
        // Northwest: Prefer horizontal first
        return this.createWestRoute(start, end);
      case "SOUTHEAST":
        // Southeast: Prefer horizontal first
        return this.createEastRoute(start, end);
      case "SOUTHWEST":
        // Southwest: Prefer horizontal first
        return this.createWestRoute(start, end);
      default:
        // Default to horizontal first
        return this.createEastRoute(start, end);
    }
  }

  /**
   * Get cardinal direction based on dx and dy
   */
  private getCardinalDirection(dx: number, dy: number): string {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Determine primary direction
    if (absDx > absDy * 1.5) {
      // Horizontal dominant
      return dx > 0 ? "EAST" : "WEST";
    } else if (absDy > absDx * 1.5) {
      // Vertical dominant
      return dy > 0 ? "SOUTH" : "NORTH";
    } else {
      // Diagonal - choose based on larger component
      if (absDx > absDy) {
        return dx > 0 ? "EAST" : "WEST";
      } else {
        return dy > 0 ? "SOUTH" : "NORTH";
      }
    }
  }

  /**
   * Create East route (horizontal first, then vertical)
   */
  private createEastRoute(
    start: RoutingPoint,
    end: RoutingPoint
  ): WireSegment[] {
    const segments: WireSegment[] = [];

    // Horizontal segment to align with end X
    segments.push({
      start: { x: start.x, y: start.y, layer: 0 },
      end: { x: end.x, y: start.y, layer: 0 },
      isHorizontal: true,
      layer: 0,
    });

    // Vertical segment to end
    segments.push({
      start: { x: end.x, y: start.y, layer: 0 },
      end: { x: end.x, y: end.y, layer: 0 },
      isHorizontal: false,
      layer: 0,
    });

    return segments;
  }

  /**
   * Create West route (horizontal first, then vertical)
   */
  private createWestRoute(
    start: RoutingPoint,
    end: RoutingPoint
  ): WireSegment[] {
    const segments: WireSegment[] = [];

    // Horizontal segment to align with end X
    segments.push({
      start: { x: start.x, y: start.y, layer: 0 },
      end: { x: end.x, y: start.y, layer: 0 },
      isHorizontal: true,
      layer: 0,
    });

    // Vertical segment to end
    segments.push({
      start: { x: end.x, y: start.y, layer: 0 },
      end: { x: end.x, y: end.y, layer: 0 },
      isHorizontal: false,
      layer: 0,
    });

    return segments;
  }

  /**
   * Create North route (vertical first, then horizontal)
   */
  private createNorthRoute(
    start: RoutingPoint,
    end: RoutingPoint
  ): WireSegment[] {
    const segments: WireSegment[] = [];

    // Vertical segment to align with end Y
    segments.push({
      start: { x: start.x, y: start.y, layer: 0 },
      end: { x: start.x, y: end.y, layer: 0 },
      isHorizontal: false,
      layer: 0,
    });

    // Horizontal segment to end
    segments.push({
      start: { x: start.x, y: end.y, layer: 0 },
      end: { x: end.x, y: end.y, layer: 0 },
      isHorizontal: true,
      layer: 0,
    });

    return segments;
  }

  /**
   * Create South route (vertical first, then horizontal)
   */
  private createSouthRoute(
    start: RoutingPoint,
    end: RoutingPoint
  ): WireSegment[] {
    const segments: WireSegment[] = [];

    // Vertical segment to align with end Y
    segments.push({
      start: { x: start.x, y: start.y, layer: 0 },
      end: { x: start.x, y: end.y, layer: 0 },
      isHorizontal: false,
      layer: 0,
    });

    // Horizontal segment to end
    segments.push({
      start: { x: start.x, y: end.y, layer: 0 },
      end: { x: end.x, y: end.y, layer: 0 },
      isHorizontal: true,
      layer: 0,
    });

    return segments;
  }

  /**
   * Create a Z-shaped route to avoid collisions
   */
  private createZShapedRoute(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponents: string[]
  ): WireSegment[] {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate smart offset based on distance and direction
    const baseOffset = Math.min(50, distance * 0.3);
    const offsets = [
      0, // No offset
      baseOffset, // Positive offset
      -baseOffset, // Negative offset
      baseOffset * 1.5, // Larger positive offset
      -baseOffset * 1.5, // Larger negative offset
    ];

    // Find the best routing path by testing different approaches
    const routes = [
      this.createHorizontalFirstRoute(start, end),
      this.createVerticalFirstRoute(start, end),
    ];

    // Add offset routes
    for (const offset of offsets) {
      routes.push(this.createOffsetRoute(start, end, offset));
      routes.push(this.createOffsetRoute(start, end, -offset));
    }

    // Choose the route with the least collisions and best score
    let bestRoute = routes[0];
    let bestScore = this.calculateRouteScore(routes[0], avoidComponents);

    for (let i = 1; i < routes.length; i++) {
      const score = this.calculateRouteScore(routes[i], avoidComponents);
      if (score < bestScore) {
        bestScore = score;
        bestRoute = routes[i];
      }
    }

    console.log(
      `🔧 Z-shaped routing: ${routes.length} routes tested, best score: ${bestScore.toFixed(2)}`
    );
    return bestRoute;
  }

  /**
   * Calculate intelligent route score (lower is better)
   */
  private calculateRouteScore(
    segments: WireSegment[],
    avoidComponents: string[]
  ): number {
    const collisions = this.countRouteCollisions(segments, avoidComponents);
    const length = this.calculatePathLength(segments);
    const bends = this.countBends(segments);

    // Calculate additional factors
    const efficiency = this.calculateEfficiency(segments);
    const aesthetics = this.calculateAesthetics(segments);

    // Weighted scoring system
    let score = 0;

    // Collisions are heavily penalized
    score += collisions * 1000;

    // Length is moderately penalized
    score += length * 0.5;

    // Bends are penalized but not too heavily
    score += bends * 20;

    // Efficiency bonus (shorter paths get bonus)
    score -= efficiency * 10;

    // Aesthetics bonus (cleaner routes get bonus)
    score -= aesthetics * 5;

    console.log(
      `🔧 Route score breakdown: collisions=${collisions}, length=${length.toFixed(1)}, bends=${bends}, efficiency=${efficiency.toFixed(1)}, aesthetics=${aesthetics.toFixed(1)}`
    );

    return Math.max(0, score); // Ensure non-negative score
  }

  /**
   * Calculate routing efficiency (higher is better)
   */
  private calculateEfficiency(segments: WireSegment[]): number {
    const totalLength = this.calculatePathLength(segments);
    const directDistance = Math.sqrt(
      Math.pow(segments[segments.length - 1].end.x - segments[0].start.x, 2) +
        Math.pow(segments[segments.length - 1].end.y - segments[0].start.y, 2)
    );

    // Efficiency is the ratio of direct distance to actual path length
    return directDistance / totalLength;
  }

  /**
   * Calculate routing aesthetics (higher is better)
   */
  private calculateAesthetics(segments: WireSegment[]): number {
    let aesthetics = 0;

    // Prefer routes with fewer segments
    aesthetics += (10 - segments.length) * 2;

    // Prefer routes with consistent segment lengths
    const lengths = segments.map((seg) =>
      Math.sqrt(
        Math.pow(seg.end.x - seg.start.x, 2) +
          Math.pow(seg.end.y - seg.start.y, 2)
      )
    );
    const avgLength =
      lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
    const variance =
      lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) /
      lengths.length;
    aesthetics += Math.max(0, 10 - variance / 100); // Lower variance is better

    // Prefer routes that follow grid alignment
    const gridAlignment = this.calculateGridAlignment(segments);
    aesthetics += gridAlignment * 5;

    return Math.max(0, aesthetics);
  }

  /**
   * Calculate how well the route aligns with grid
   */
  private calculateGridAlignment(segments: WireSegment[]): number {
    let alignment = 0;

    for (const segment of segments) {
      // Check if segment endpoints align with grid
      const startAligned =
        segment.start.x % this.cellSize === 0 &&
        segment.start.y % this.cellSize === 0;
      const endAligned =
        segment.end.x % this.cellSize === 0 &&
        segment.end.y % this.cellSize === 0;

      if (startAligned) alignment += 1;
      if (endAligned) alignment += 1;
    }

    return alignment / (segments.length * 2); // Normalize to 0-1
  }

  /**
   * Create horizontal-first route
   */
  private createHorizontalFirstRoute(
    start: RoutingPoint,
    end: RoutingPoint
  ): WireSegment[] {
    const segments: WireSegment[] = [];
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    // Horizontal segment
    segments.push({
      start: { x: start.x, y: start.y, layer: 0 },
      end: { x: end.x, y: start.y, layer: 0 },
      isHorizontal: true,
      layer: 0,
    });

    // Vertical segment
    segments.push({
      start: { x: end.x, y: start.y, layer: 0 },
      end: { x: end.x, y: end.y, layer: 0 },
      isHorizontal: false,
      layer: 0,
    });

    return segments;
  }

  /**
   * Create vertical-first route
   */
  private createVerticalFirstRoute(
    start: RoutingPoint,
    end: RoutingPoint
  ): WireSegment[] {
    const segments: WireSegment[] = [];
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    // Vertical segment
    segments.push({
      start: { x: start.x, y: start.y, layer: 0 },
      end: { x: start.x, y: end.y, layer: 0 },
      isHorizontal: false,
      layer: 0,
    });

    // Horizontal segment
    segments.push({
      start: { x: start.x, y: end.y, layer: 0 },
      end: { x: end.x, y: end.y, layer: 0 },
      isHorizontal: true,
      layer: 0,
    });

    return segments;
  }

  /**
   * Create intelligent offset route to avoid collisions
   */
  private createOffsetRoute(
    start: RoutingPoint,
    end: RoutingPoint,
    offset: number
  ): WireSegment[] {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const cardinalDirection = this.getCardinalDirection(dx, dy);

    // Choose offset direction based on cardinal direction
    let offsetX = 0;
    let offsetY = 0;

    switch (cardinalDirection) {
      case "EAST":
      case "WEST":
        // Horizontal dominant - offset vertically
        offsetY = offset;
        break;
      case "NORTH":
      case "SOUTH":
        // Vertical dominant - offset horizontally
        offsetX = offset;
        break;
      default:
        // Diagonal - offset in both directions
        offsetX = offset * 0.7;
        offsetY = offset * 0.7;
        break;
    }

    return this.createZShapedRouteWithOffset(start, end, offsetX, offsetY);
  }

  /**
   * Create Z-shaped route with specific X and Y offsets
   */
  private createZShapedRouteWithOffset(
    start: RoutingPoint,
    end: RoutingPoint,
    offsetX: number,
    offsetY: number
  ): WireSegment[] {
    const segments: WireSegment[] = [];
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    // Calculate intermediate points
    const midX = start.x + dx / 2;
    const midY = start.y + dy / 2;
    const offsetPointX = midX + offsetX;
    const offsetPointY = midY + offsetY;

    // Create Z-shaped path
    segments.push({
      start: { x: start.x, y: start.y, layer: 0 },
      end: { x: offsetPointX, y: start.y, layer: 0 },
      isHorizontal: true,
      layer: 0,
    });

    segments.push({
      start: { x: offsetPointX, y: start.y, layer: 0 },
      end: { x: offsetPointX, y: offsetPointY, layer: 0 },
      isHorizontal: false,
      layer: 0,
    });

    segments.push({
      start: { x: offsetPointX, y: offsetPointY, layer: 0 },
      end: { x: end.x, y: offsetPointY, layer: 0 },
      isHorizontal: true,
      layer: 0,
    });

    segments.push({
      start: { x: end.x, y: offsetPointY, layer: 0 },
      end: { x: end.x, y: end.y, layer: 0 },
      isHorizontal: false,
      layer: 0,
    });

    return segments;
  }

  /**
   * Check if there are collisions between start and end points
   */
  private hasCollisions(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponents: string[]
  ): boolean {
    // Check for collisions with components
    for (const [componentId, component] of this.components) {
      if (avoidComponents.includes(componentId)) continue;

      const position = component.getPosition();
      const displayObject = component.displayObject();
      const bounds = displayObject.getBounds();

      if (this.lineIntersectsRect(start, end, position, bounds)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a line intersects with a rectangle
   */
  private lineIntersectsRect(
    start: RoutingPoint,
    end: RoutingPoint,
    rectPos: { x: number; y: number },
    rectBounds: { width: number; height: number }
  ): boolean {
    const rect = {
      x: rectPos.x,
      y: rectPos.y,
      width: rectBounds.width,
      height: rectBounds.height,
    };

    // Check if line intersects with rectangle
    return (
      this.lineIntersectsLine(
        start,
        end,
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.width, y: rect.y }
      ) ||
      this.lineIntersectsLine(
        start,
        end,
        { x: rect.x + rect.width, y: rect.y },
        { x: rect.x + rect.width, y: rect.y + rect.height }
      ) ||
      this.lineIntersectsLine(
        start,
        end,
        { x: rect.x + rect.width, y: rect.y + rect.height },
        { x: rect.x, y: rect.y + rect.height }
      ) ||
      this.lineIntersectsLine(
        start,
        end,
        { x: rect.x, y: rect.y + rect.height },
        { x: rect.x, y: rect.y }
      )
    );
  }

  /**
   * Check if two lines intersect
   */
  private lineIntersectsLine(
    line1Start: RoutingPoint,
    line1End: RoutingPoint,
    line2Start: { x: number; y: number },
    line2End: { x: number; y: number }
  ): boolean {
    // Simple line intersection check
    const x1 = line1Start.x;
    const y1 = line1Start.y;
    const x2 = line1End.x;
    const y2 = line1End.y;
    const x3 = line2Start.x;
    const y3 = line2Start.y;
    const x4 = line2End.x;
    const y4 = line2End.y;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return false; // Lines are parallel

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  /**
   * Count collisions in a route
   */
  private countRouteCollisions(
    segments: WireSegment[],
    avoidComponents: string[]
  ): number {
    let collisions = 0;

    for (const segment of segments) {
      if (this.hasCollisions(segment.start, segment.end, avoidComponents)) {
        collisions++;
      }
    }

    return collisions;
  }

  /**
   * Calculate total path length
   */
  private calculatePathLength(segments: WireSegment[]): number {
    return segments.reduce((total, segment) => {
      const dx = segment.end.x - segment.start.x;
      const dy = segment.end.y - segment.start.y;
      return total + Math.sqrt(dx * dx + dy * dy);
    }, 0);
  }

  /**
   * Count number of bends in the path
   */
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

  /**
   * Update component positions
   */
  public updateComponentPosition(
    componentId: string,
    x: number,
    y: number
  ): void {
    const component = this.components.get(componentId);
    if (component) {
      component.setPosition(x, y);
    }
  }

  /**
   * Clear all components
   */
  public clear(): void {
    this.components.clear();
  }
}
