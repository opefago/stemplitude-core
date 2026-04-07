/**
 * Split an orthogonal segment at a point on the segment (grid-snapped).
 * Returns new segments for the host wire only — junction + stub wire creation is caller responsibility.
 */

import type { WireSegment } from "../../InteractiveWireSystem";
import { mergeCollinearOrthoSegments } from "./RouteNormalizer";

const EPS = 0.5;

export type SplitResult = {
  segmentIndex: number;
  /** Segments replacing wire.segments when splicing */
  replacement: WireSegment[];
  junctionWorld: { x: number; y: number };
};

export function splitSegmentAtPoint(
  segments: WireSegment[],
  segmentIndex: number,
  world: { x: number; y: number },
  grid: number,
): SplitResult | null {
  if (segmentIndex < 0 || segmentIndex >= segments.length) return null;
  const s = segments[segmentIndex]!;
  let jx = world.x;
  let jy = world.y;
  if (s.isHorizontal) {
    jy = s.start.y;
    jx = Math.round(world.x / grid) * grid;
    const minX = Math.min(s.start.x, s.end.x);
    const maxX = Math.max(s.start.x, s.end.x);
    jx = Math.max(minX, Math.min(maxX, jx));
  } else {
    jx = s.start.x;
    jy = Math.round(world.y / grid) * grid;
    const minY = Math.min(s.start.y, s.end.y);
    const maxY = Math.max(s.start.y, s.end.y);
    jy = Math.max(minY, Math.min(maxY, jy));
  }

  if (
    Math.hypot(jx - s.start.x, jy - s.start.y) < EPS ||
    Math.hypot(jx - s.end.x, jy - s.end.y) < EPS
  ) {
    return null;
  }

  const layer = s.layer ?? 0;
  const a: WireSegment = {
    start: { ...s.start },
    end: { x: jx, y: jy, layer },
    isHorizontal: s.isHorizontal,
    layer,
  };
  const b: WireSegment = {
    start: { x: jx, y: jy, layer },
    end: { ...s.end },
    isHorizontal: s.isHorizontal,
    layer,
  };

  const next = [
    ...segments.slice(0, segmentIndex),
    a,
    b,
    ...segments.slice(segmentIndex + 1),
  ];
  const replacement = mergeCollinearOrthoSegments(next);
  return { segmentIndex, replacement, junctionWorld: { x: jx, y: jy } };
}
