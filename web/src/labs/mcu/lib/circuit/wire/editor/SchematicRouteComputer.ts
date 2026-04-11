/**
 * Unified schematic routing: same entry point for preview and committed wires.
 * Tries axis-aligned straight segments when aligned, clear, and short enough;
 * otherwise defers to the orthogonal router (A* / Manhattan).
 */

import type { CircuitComponent } from "../../CircuitComponent";
import type { RoutingPoint, WirePath, WireSegment } from "../../OptimizedWireRouter";
import { mergeCollinearOrthoSegments } from "./RouteNormalizer";

/** Inflated component bbox in world space (matches router keep-out mentality). */
export type SchematicObstacle = { x: number; y: number; w: number; h: number };

export type SchematicRoutePolicy = {
  alignmentTolPx: number;
  maxStraightSegmentPx: number;
  obstacleClearancePx: number;
  /** Extra inflation beyond symbol bounds for straight-route clearance tests */
  bodyPaddingPx: number;
  /**
   * Shorten each end of a candidate straight segment before obstacle tests so endpoint
   * symbols can still be entered for pin snap, but the span through other bodies is blocked.
   */
  straightEndpointCapPx: number;
};

export const DEFAULT_SCHEMATIC_ROUTE_POLICY: SchematicRoutePolicy = {
  alignmentTolPx: 4,
  maxStraightSegmentPx: 480,
  obstacleClearancePx: 6,
  bodyPaddingPx: 32,
  straightEndpointCapPx: 28,
};

export type ComputeSchematicRouteParams = {
  start: RoutingPoint;
  end: RoutingPoint;
  /** Passed through to orthogonal router (endpin bodies free for occupancy). */
  avoidComponentIds: string[];
  /**
   * Legacy: previously excluded endpoint bboxes from straight clearance (caused runs through bodies).
   * Retained for call-site compatibility; straight tests use all symbols + endpoint caps instead.
   */
  straightExcludeComponentIds: Set<string>;
  components: Map<string, CircuitComponent>;
  routeOrthogonal: (
    start: RoutingPoint,
    end: RoutingPoint,
    avoidComponentIds: string[],
  ) => WirePath;
  gridPx: number;
  policy?: Partial<SchematicRoutePolicy>;
};

function policy(p?: Partial<SchematicRoutePolicy>): SchematicRoutePolicy {
  return { ...DEFAULT_SCHEMATIC_ROUTE_POLICY, ...p };
}

/** World obstacles for straight routing clearance (excludes endpoint symbols). */
export function collectSchematicObstacles(
  components: Map<string, CircuitComponent>,
  excludeIds: Set<string>,
  bodyPaddingPx: number,
): SchematicObstacle[] {
  const out: SchematicObstacle[] = [];
  for (const [id, c] of components) {
    if (excludeIds.has(id)) continue;
    const dob = c.displayObject();
    const b = dob.getBounds();
    const w = b.width > 0 ? b.width : 80;
    const h = b.height > 0 ? b.height : 60;
    const pad = bodyPaddingPx;
    out.push({
      x: b.x - pad,
      y: b.y - pad,
      w: w + 2 * pad,
      h: h + 2 * pad,
    });
  }
  return out;
}

/** Liang–Barsky: segment t in [0,1] intersects closed AABB. */
function segmentIntersectsAabb(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
): boolean {
  const minx = Math.min(x0, x1);
  const maxx = Math.max(x0, x1);
  const miny = Math.min(y0, y1);
  const maxy = Math.max(y0, y1);
  if (maxx < left || minx > right || maxy < top || miny > bottom) return false;

  const dx = x1 - x0;
  const dy = y1 - y0;
  let u1 = 0;
  let u2 = 1;

  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > u2) return false;
      if (r > u1) u1 = r;
    } else {
      if (r < u1) return false;
      if (r < u2) u2 = r;
    }
    return true;
  };

  if (
    !clip(-dx, x0 - left) ||
    !clip(dx, right - x0) ||
    !clip(-dy, y0 - top) ||
    !clip(dy, bottom - y0)
  ) {
    return false;
  }
  return u1 <= u2;
}

function segmentHitsObstacles(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  obstacles: SchematicObstacle[],
  inflate: number,
): boolean {
  for (const o of obstacles) {
    const L = o.x - inflate;
    const T = o.y - inflate;
    const R = o.x + o.w + inflate;
    const B = o.y + o.h + inflate;
    if (segmentIntersectsAabb(x0, y0, x1, y1, L, T, R, B)) return true;
  }
  return false;
}

/** Middle of segment P→Q after shaving `cap` from each end (for clearance tests). */
function trimmedSegmentForObstacleTest(
  px: number,
  py: number,
  qx: number,
  qy: number,
  cap: number,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const dx = qx - px;
  const dy = qy - py;
  const L = Math.hypot(dx, dy);
  if (L < 1) return null;
  const ux = dx / L;
  const uy = dy / L;
  const c = Math.min(cap, L * 0.45);
  const x0 = px + ux * c;
  const y0 = py + uy * c;
  const x1 = qx - ux * c;
  const y1 = qy - uy * c;
  const innerLen = (x1 - x0) * ux + (y1 - y0) * uy;
  if (innerLen < 2) return null;
  return { x0, y0, x1, y1 };
}

function wirePathFromSegments(segments: WireSegment[]): WirePath {
  let totalLength = 0;
  let bends = 0;
  let prevH: boolean | null = null;
  for (const s of segments) {
    totalLength +=
      Math.abs(s.end.x - s.start.x) + Math.abs(s.end.y - s.start.y);
    if (prevH !== null && prevH !== s.isHorizontal) bends++;
    prevH = s.isHorizontal;
  }
  return {
    segments,
    totalLength,
    bendCount: bends,
    layer: 0,
  };
}

const V_EPS = 0.75;
const VERTEX_DEDUP = 0.5;

function verticesFromSegments(segments: WireSegment[]): { x: number; y: number }[] {
  const v: { x: number; y: number }[] = [];
  const push = (p: { x: number; y: number }) => {
    const last = v[v.length - 1];
    if (
      last &&
      Math.abs(last.x - p.x) <= VERTEX_DEDUP &&
      Math.abs(last.y - p.y) <= VERTEX_DEDUP
    ) {
      return;
    }
    v.push({ ...p });
  };
  if (!segments.length) return v;
  push({ x: segments[0]!.start.x, y: segments[0]!.start.y });
  for (const s of segments) push({ x: s.end.x, y: s.end.y });
  return v;
}

function segmentsFromVertices(verts: { x: number; y: number }[]): WireSegment[] {
  const out: WireSegment[] = [];
  for (let i = 0; i < verts.length - 1; i++) {
    const a = verts[i]!;
    const b = verts[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;
    if (Math.abs(dy) < 0.01) {
      out.push({
        start: { x: a.x, y: a.y, layer: 0 },
        end: { x: b.x, y: a.y, layer: 0 },
        isHorizontal: true,
        layer: 0,
      });
    } else if (Math.abs(dx) < 0.01) {
      out.push({
        start: { x: a.x, y: a.y, layer: 0 },
        end: { x: a.x, y: b.y, layer: 0 },
        isHorizontal: false,
        layer: 0,
      });
    } else {
      const c1 = { x: b.x, y: a.y, layer: 0 };
      out.push({
        start: { x: a.x, y: a.y, layer: 0 },
        end: { ...c1 },
        isHorizontal: true,
        layer: 0,
      });
      out.push({
        start: { ...c1 },
        end: { x: b.x, y: b.y, layer: 0 },
        isHorizontal: false,
        layer: 0,
      });
    }
  }
  return mergeCollinearOrthoSegments(out);
}

/** True if trimmed axis segment hits inflated obstacles (same trimming as tryStraightWirePath). */
function segmentObstructedTrimmed(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  obstacles: SchematicObstacle[],
  clr: number,
  cap: number,
): boolean {
  const inner = trimmedSegmentForObstacleTest(x0, y0, x1, y1, cap);
  if (!inner) return false;
  return segmentHitsObstacles(
    inner.x0,
    inner.y0,
    inner.x1,
    inner.y1,
    obstacles,
    clr,
  );
}

/**
 * Shortest Manhattan path A→B with ≤1 bend if both L variants are clear; else single axis when collinear.
 * Returns vertices after A toward B (excluding A, including B). Empty if A≈B.
 */
function orthoShortcutChain(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  obstacles: SchematicObstacle[],
  clr: number,
  cap: number,
): { x: number; y: number }[] | null {
  const samex = Math.abs(ax - bx) <= V_EPS;
  const samey = Math.abs(ay - by) <= V_EPS;
  if (samex && samey) return [];
  if (samey) {
    if (segmentObstructedTrimmed(ax, ay, bx, by, obstacles, clr, cap)) return null;
    return [{ x: bx, y: by }];
  }
  if (samex) {
    if (segmentObstructedTrimmed(ax, ay, bx, by, obstacles, clr, cap)) return null;
    return [{ x: bx, y: by }];
  }
  const c1x = ax;
  const c1y = by;
  const c2x = bx;
  const c2y = ay;
  const ok1 =
    !segmentObstructedTrimmed(ax, ay, c1x, c1y, obstacles, clr, cap) &&
    !segmentObstructedTrimmed(c1x, c1y, bx, by, obstacles, clr, cap);
  const ok2 =
    !segmentObstructedTrimmed(ax, ay, c2x, c2y, obstacles, clr, cap) &&
    !segmentObstructedTrimmed(c2x, c2y, bx, by, obstacles, clr, cap);
  if (ok1 && ok2) {
    const m1 =
      Math.abs(ax - c1x) +
      Math.abs(ay - c1y) +
      Math.abs(c1x - bx) +
      Math.abs(c1y - by);
    const m2 =
      Math.abs(ax - c2x) +
      Math.abs(ay - c2y) +
      Math.abs(c2x - bx) +
      Math.abs(c2y - by);
    if (m1 <= m2) return [{ x: c1x, y: c1y }, { x: bx, y: by }];
    return [{ x: c2x, y: c2y }, { x: bx, y: by }];
  }
  if (ok1) return [{ x: c1x, y: c1y }, { x: bx, y: by }];
  if (ok2) return [{ x: c2x, y: c2y }, { x: bx, y: by }];
  return null;
}

function simplifyVertexChain(
  verts: { x: number; y: number }[],
  obstacles: SchematicObstacle[],
  clr: number,
  cap: number,
): { x: number; y: number }[] {
  const newVerts: { x: number; y: number }[] = [verts[0]!];
  let i = 0;
  while (i < verts.length - 1) {
    for (let j = verts.length - 1; j > i; j--) {
      if (j === i + 1) {
        const b = verts[j]!;
        const last = newVerts[newVerts.length - 1]!;
        if (Math.abs(last.x - b.x) > VERTEX_DEDUP || Math.abs(last.y - b.y) > VERTEX_DEDUP) {
          newVerts.push({ ...b });
        }
        i = j;
        break;
      }
      const chain = orthoShortcutChain(
        verts[i]!.x,
        verts[i]!.y,
        verts[j]!.x,
        verts[j]!.y,
        obstacles,
        clr,
        cap,
      );
      if (chain) {
        for (const p of chain) {
          const last = newVerts[newVerts.length - 1]!;
          if (Math.abs(last.x - p.x) > VERTEX_DEDUP || Math.abs(last.y - p.y) > VERTEX_DEDUP) {
            newVerts.push({ ...p });
          }
        }
        i = j;
        break;
      }
    }
  }
  return newVerts;
}

/**
 * Pull A* polylines straight: remove interior vertices when an axis or single-corner shortcut
 * is obstacle-free (trimmed clearance, same rules as straight routing).
 */
function simplifyOrthogonalSegmentsAgainstObstacles(
  segments: WireSegment[],
  obstacles: SchematicObstacle[],
  pol: SchematicRoutePolicy,
): WireSegment[] {
  const clr = pol.obstacleClearancePx;
  const cap = pol.straightEndpointCapPx;
  let cur = mergeCollinearOrthoSegments(segments);
  for (let pass = 0; pass < 14; pass++) {
    const verts = verticesFromSegments(cur);
    if (verts.length <= 2) break;
    const shortened = simplifyVertexChain(verts, obstacles, clr, cap);
    const next = segmentsFromVertices(shortened);
    if (verticesFromSegments(next).length >= verts.length) break;
    cur = next;
  }
  return mergeCollinearOrthoSegments(cur);
}

/**
 * Axis-aligned straight wire when pins are aligned (within tolerance), length cap,
 * and segment does not pass through other components' keep-outs.
 */
function tryStraightWirePath(
  start: RoutingPoint,
  end: RoutingPoint,
  obstaclesAll: SchematicObstacle[],
  pol: SchematicRoutePolicy,
): WirePath | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const tol = pol.alignmentTolPx;
  const maxL = pol.maxStraightSegmentPx;
  const clr = pol.obstacleClearancePx;
  const cap = pol.straightEndpointCapPx;

  if (Math.abs(dy) <= tol && Math.abs(dx) > 0.5 && Math.abs(dx) <= maxL) {
    const y = start.y;
    const inner = trimmedSegmentForObstacleTest(
      start.x,
      y,
      end.x,
      y,
      cap,
    );
    const clear =
      inner &&
      !segmentHitsObstacles(
        inner.x0,
        inner.y0,
        inner.x1,
        inner.y1,
        obstaclesAll,
        clr,
      );
    if (clear) {
      const seg: WireSegment = {
        start: { x: start.x, y, layer: 0 },
        end: { x: end.x, y, layer: 0 },
        isHorizontal: true,
        layer: 0,
      };
      return wirePathFromSegments([seg]);
    }
  }

  if (Math.abs(dx) <= tol && Math.abs(dy) > 0.5 && Math.abs(dy) <= maxL) {
    const x = start.x;
    const inner = trimmedSegmentForObstacleTest(
      x,
      start.y,
      x,
      end.y,
      cap,
    );
    const clear =
      inner &&
      !segmentHitsObstacles(
        inner.x0,
        inner.y0,
        inner.x1,
        inner.y1,
        obstaclesAll,
        clr,
      );
    if (clear) {
      const seg: WireSegment = {
        start: { x, y: start.y, layer: 0 },
        end: { x, y: end.y, layer: 0 },
        isHorizontal: false,
        layer: 0,
      };
      return wirePathFromSegments([seg]);
    }
  }

  return null;
}

/**
 * Single routing pipeline: straight (when schematic-clean) else orthogonal.
 * Caller applies postProcessPath / ensureNodeAnchors for pin snapping.
 */
export function computeSchematicRoute(
  params: ComputeSchematicRouteParams,
): WirePath {
  void params.straightExcludeComponentIds;
  const pol = policy(params.policy);
  /** Straight clearance uses every symbol's keep-out on an inner segment (see `straightEndpointCapPx`). */
  const obstaclesAll = collectSchematicObstacles(
    params.components,
    new Set(),
    pol.bodyPaddingPx,
  );

  const straight = tryStraightWirePath(
    params.start,
    params.end,
    obstaclesAll,
    pol,
  );
  if (straight) {
    return straight;
  }

  const ortho = params.routeOrthogonal(
    params.start,
    params.end,
    params.avoidComponentIds,
  );
  let merged = mergeCollinearOrthoSegments(ortho.segments);
  merged = simplifyOrthogonalSegmentsAgainstObstacles(
    merged,
    obstaclesAll,
    pol,
  );
  merged = mergeCollinearOrthoSegments(merged);
  return wirePathFromSegments(merged);
}

/** Component ids at leg endpoints — excluded from straight-segment obstruction tests. */
export function straightExcludeForEndpointNodes(
  ...nodes: Array<{ type: string; componentId?: string } | undefined | null>
): Set<string> {
  const s = new Set<string>();
  for (const n of nodes) {
    if (n?.type === "component" && n.componentId) s.add(n.componentId);
  }
  return s;
}

export function straightExcludeForNodes(
  a: { type: string; componentId?: string } | undefined,
  b: { type: string; componentId?: string } | undefined,
): Set<string> {
  return straightExcludeForEndpointNodes(a, b);
}
