import { OrthogonalWireRouter } from "./OrthogonalWireRouter";
import { OptimizedWireRouter } from "./OptimizedWireRouter";
import { CircuitComponent } from "./CircuitComponent";
import { WirePath, RoutingPoint, WireSegment } from "./OptimizedWireRouter";

/**
 * Hybrid wire routing system that combines multiple algorithms
 * Uses OrthogonalWireRouter for clean L/Z-shaped routing and A* for complex obstacle avoidance
 */
export class HybridWireRouter {
  private orthogonalRouter: OrthogonalWireRouter;
  private aStarRouter: OptimizedWireRouter;
  private components: Map<string, CircuitComponent>;
  private routingStrategy: "orthogonal" | "astar" | "hybrid" = "orthogonal";

  constructor(gridWidth: number, gridHeight: number, cellSize: number = 10) {
    this.orthogonalRouter = new OrthogonalWireRouter(cellSize);
    this.aStarRouter = new OptimizedWireRouter(
      gridWidth,
      gridHeight,
      cellSize,
      {
        preferOrthogonal: true,
        minimizeBends: true,
        avoidComponents: true,
        enablePostProcessing: true,
        mergeCollinearSegments: true,
        enableCaching: true,
        maxSearchIterations: 5000,
      }
    );
    this.components = new Map();
  }

  /**
   * Set the routing strategy
   */
  public setRoutingStrategy(strategy: "orthogonal" | "astar" | "hybrid"): void {
    this.routingStrategy = strategy;
    console.log(`🔄 Switched to ${strategy} routing strategy`);
  }

  /**
   * Add a component to the routing system
   */
  public addComponent(component: CircuitComponent): void {
    this.components.set(component.getName(), component);
    this.orthogonalRouter.addComponent(component);
    this.aStarRouter.addComponent(component);
    console.log(
      `🔌 Added component ${component.getName()} to hybrid router (v2.0)`
    );
  }

  /**
   * Remove a component from the routing system
   */
  public removeComponent(componentId: string): void {
    this.components.delete(componentId);
    this.orthogonalRouter.removeComponent(componentId);
    this.aStarRouter.removeComponent(componentId);
    console.log(`🗑️ Removed component ${componentId} from hybrid router`);
  }

  /**
   * Route a wire using the selected strategy
   */
  public routeWire(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponents: string[] = []
  ): WirePath {
    switch (this.routingStrategy) {
      case "orthogonal":
        return this.routeWithOrthogonal(start, end, avoidComponents);
      case "astar":
        return this.routeWithAStar(start, end, avoidComponents);
      case "hybrid":
        return this.routeWithHybrid(start, end, avoidComponents);
      default:
        return this.routeWithHybrid(start, end, avoidComponents);
    }
  }

  /**
   * Route using OrthogonalWireRouter (best for clean L/Z-shaped routing)
   */
  private routeWithOrthogonal(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponents: string[]
  ): WirePath {
    console.log(`🧭 Using Orthogonal routing for wire`);
    return this.orthogonalRouter.routeWire(start, end, avoidComponents);
  }

  /**
   * Route using A* (best for obstacle avoidance)
   */
  private routeWithAStar(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponents: string[]
  ): WirePath {
    console.log(`🧭 Using A* routing for wire`);
    return this.aStarRouter.routeWire(start, end, avoidComponents);
  }

  /**
   * Route using hybrid approach (combines both algorithms)
   */
  private routeWithHybrid(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponents: string[]
  ): WirePath {
    console.log(`🧭 Using hybrid routing for wire`);

    // First, try OrthogonalWireRouter for clean routing
    const orthogonalPath = this.orthogonalRouter.routeWire(
      start,
      end,
      avoidComponents
    );

    // Then, use A* to optimize around obstacles
    const aStarPath = this.aStarRouter.routeWire(start, end, avoidComponents);

    // If A* path is not strictly orthogonal, heavily penalize it
    const aStarIsOrthogonal = this.isOrthogonalPath(aStarPath);

    // Choose the better path based on criteria
    const orthogonalScore = this.calculatePathScore(orthogonalPath);
    const aStarScore = this.calculatePathScore(aStarPath, aStarIsOrthogonal);

    console.log(
      `📊 Orthogonal score: ${orthogonalScore}, A* score: ${aStarScore}`
    );

    // Prefer A* if it is orthogonal and significantly better
    if (aStarIsOrthogonal && aStarScore < orthogonalScore * 0.8) {
      console.log(`✅ Using A* path (better obstacle avoidance)`);
      return aStarPath;
    } else {
      console.log(`✅ Using Orthogonal path (better layout)`);
      return orthogonalPath;
    }
  }

  /**
   * Calculate a score for path quality
   */
  private calculatePathScore(
    path: WirePath,
    isOrthogonal: boolean = true
  ): number {
    // Lower score is better
    const lengthWeight = 0.4;
    const bendWeight = 0.3;
    const layerWeight = 0.3;

    let score =
      path.totalLength * lengthWeight +
      path.bendCount * 10 * bendWeight +
      path.layer * 5 * layerWeight;

    // Strongly penalize non-orthogonal segments
    if (!isOrthogonal) {
      score += 10000; // make non-orthogonal paths extremely unlikely to be chosen
    }

    return score;
  }

  /**
   * Determine if all segments in the path are strictly orthogonal
   */
  private isOrthogonalPath(path: WirePath): boolean {
    if (!path || !path.segments || path.segments.length === 0) return true;
    return path.segments.every(
      (seg) => seg.start.x === seg.end.x || seg.start.y === seg.end.y
    );
  }

  /**
   * Update component positions
   */
  public updateComponentPosition(
    componentId: string,
    x: number,
    y: number
  ): void {
    this.orthogonalRouter.updateComponentPosition(componentId, x, y);
    this.aStarRouter.updateComponentPosition(componentId, x, y);
  }

  /**
   * Get routing statistics
   */
  public getRoutingStats(): {
    strategy: string;
    componentCount: number;
    dagreAvailable: boolean;
    aStarAvailable: boolean;
  } {
    return {
      strategy: this.routingStrategy,
      componentCount: this.components.size,
      dagreAvailable: true,
      aStarAvailable: true,
    };
  }

  /**
   * Clear all components and reset
   */
  public clear(): void {
    this.components.clear();
    this.orthogonalRouter.clear();
    this.aStarRouter.clear();
    console.log(`🧹 Cleared hybrid router`);
  }
}
