/**
 * Single entry for orthogonal routing — wraps OptimizedWireRouter / hybrid strategies.
 * Does not touch electrical nets.
 */

import type { OptimizedWireRouter, RoutingPoint, WirePath } from "../../OptimizedWireRouter";
import type { HybridWireRouter } from "../../HybridWireRouter";
import { mergeCollinearOrthoSegments, wirePathCost } from "./RouteNormalizer";

export type WireRouterFacadeOptions = {
  gridCellSize: number;
  /** Cost ratio: accept new route only if <= this × old cost when old was valid */
  maxCostIncreaseRatio: number;
};

const DEFAULT_OPTS: WireRouterFacadeOptions = {
  gridCellSize: 20,
  maxCostIncreaseRatio: 1.15,
};

export class WireRouterFacade {
  private opts: WireRouterFacadeOptions;

  constructor(
    private readonly optimized: OptimizedWireRouter,
    private readonly hybrid: HybridWireRouter,
    opts?: Partial<WireRouterFacadeOptions>,
  ) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
  }

  /**
   * Primary orthogonal route using OptimizedWireRouter (grid-aware, obstacles).
   * Uses router-internal caching; output is collinear-merged.
   */
  routeWire(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponentIds: string[],
  ): WirePath {
    const path = this.optimized.routeWire(start, end, avoidComponentIds);
    const merged = mergeCollinearOrthoSegments(path.segments);
    return { ...path, segments: merged };
  }

  /**
   * If `previousCost` is known and new path is much worse, return null (caller keeps old).
   */
  routeWireWithCostCap(
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponentIds: string[],
    previousCost: number | undefined,
    previousValid: boolean,
  ): WirePath | null {
    const next = this.routeWire(start, end, avoidComponentIds);
    const c = wirePathCost(next.segments);
    if (
      previousValid &&
      previousCost !== undefined &&
      c > previousCost * this.opts.maxCostIncreaseRatio
    ) {
      return null;
    }
    return next;
  }

  getHybrid(): HybridWireRouter {
    return this.hybrid;
  }

  /** Clear router memoization after obstacle / grid changes. */
  invalidateCaches(): void {
    this.optimized.clearCache();
    this.hybrid.clear();
  }
}
