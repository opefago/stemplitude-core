/**
 * Orthogonal polyline cleanup: grid snap, zero-length removal, collinear merge.
 */

import type { RoutingPoint, WireSegment } from "../../OptimizedWireRouter";

/** World-space: joints closer than this still count as one vertex after routing/rounding. */
const EPS = 1.0;

export function snapScalar(v: number, grid: number): number {
  if (grid <= 0) return v;
  return Math.round(v / grid) * grid;
}

export function snapPoint(
  p: RoutingPoint,
  grid: number,
): RoutingPoint {
  return {
    x: snapScalar(p.x, grid),
    y: snapScalar(p.y, grid),
    layer: p.layer ?? 0,
  };
}

/** Merge consecutive collinear segments (same axis) where endpoints meet. */
export function mergeCollinearOrthoSegments(
  segments: WireSegment[],
): WireSegment[] {
  if (segments.length <= 1) return segments;
  const out: WireSegment[] = [];
  let cur: WireSegment | null = null;

  for (const s of segments) {
    const seg: WireSegment = {
      start: { ...s.start },
      end: { ...s.end },
      isHorizontal: s.isHorizontal,
      layer: s.layer ?? 0,
    };
    if (!cur) {
      cur = seg;
      continue;
    }
    if (cur.isHorizontal === seg.isHorizontal) {
      const touches =
        Math.abs(cur.end.x - seg.start.x) <= EPS &&
        Math.abs(cur.end.y - seg.start.y) <= EPS;
      if (touches) {
        cur.end = { ...seg.end };
        continue;
      }
    }
    if (
      Math.abs(cur.start.x - cur.end.x) > EPS ||
      Math.abs(cur.start.y - cur.end.y) > EPS
    ) {
      out.push(cur);
    }
    cur = seg;
  }
  if (
    cur &&
    (Math.abs(cur.start.x - cur.end.x) > EPS ||
      Math.abs(cur.start.y - cur.end.y) > EPS)
  ) {
    out.push(cur);
  }
  return out;
}

export function wirePathCost(segments: WireSegment[]): number {
  let L = 0;
  let bends = 0;
  let prevH: boolean | null = null;
  for (const s of segments) {
    L +=
      Math.abs(s.end.x - s.start.x) + Math.abs(s.end.y - s.start.y);
    if (prevH !== null && prevH !== s.isHorizontal) bends++;
    prevH = s.isHorizontal;
  }
  return L + bends * 8;
}

/**
 * Collapse tiny H–V–H / V–H–V “stair steps” from grid/rounding (not obstacle detours).
 * Outer rails must line up within `alignPx` and the middle leg must be ≤ `maxSpikePx`.
 */
export function removeShortOrthogonalSpikes(
  segments: WireSegment[],
  maxSpikePx: number,
  alignPx = 2.5,
): WireSegment[] {
  const SPIKE = Math.max(0.5, maxSpikePx);
  let s = mergeCollinearOrthoSegments(segments);
  for (let iter = 0; iter < 48 && s.length >= 3; iter++) {
    let replacedAt = -1;
    let replacement: WireSegment[] | null = null;

    for (let i = 0; i <= s.length - 3; i++) {
      const a = s[i]!;
      const b = s[i + 1]!;
      const c = s[i + 2]!;
      const layer = a.layer ?? 0;

      if (a.isHorizontal && !b.isHorizontal && c.isHorizontal) {
        const vert = Math.abs(b.end.y - b.start.y);
        const rowA = a.start.y;
        const rowC = c.end.y;
        if (vert <= SPIKE && Math.abs(rowA - rowC) <= alignPx) {
          const y = (rowA + rowC) / 2;
          replacement = [
            {
              start: { x: a.start.x, y, layer },
              end: { x: c.end.x, y, layer },
              isHorizontal: true,
              layer,
            },
          ];
          replacedAt = i;
          break;
        }
      } else if (!a.isHorizontal && b.isHorizontal && !c.isHorizontal) {
        const horz = Math.abs(b.end.x - b.start.x);
        const colA = a.start.x;
        const colC = c.end.x;
        if (horz <= SPIKE && Math.abs(colA - colC) <= alignPx) {
          const x = (colA + colC) / 2;
          replacement = [
            {
              start: { x, y: a.start.y, layer },
              end: { x, y: c.end.y, layer },
              isHorizontal: false,
              layer,
            },
          ];
          replacedAt = i;
          break;
        }
      }
    }

    if (replacedAt < 0 || !replacement) break;
    s = [...s.slice(0, replacedAt), ...replacement, ...s.slice(replacedAt + 3)];
    s = mergeCollinearOrthoSegments(s);
  }
  return s;
}

/** Collinear merge → spike removal → collinear merge. */
export function finalizeOrthogonalWireSegments(
  segments: WireSegment[],
  maxSpikePx: number,
): WireSegment[] {
  const m = mergeCollinearOrthoSegments(segments);
  return mergeCollinearOrthoSegments(
    removeShortOrthogonalSpikes(m, maxSpikePx),
  );
}
