import type {
  InteractiveWireConnection,
  WireNode,
  WireSegment,
} from "./InteractiveWireSystem";

function segmentsToPolylinePoints(
  segments: WireSegment[],
): { x: number; y: number }[] {
  if (segments.length === 0) return [];
  const pts: { x: number; y: number }[] = [
    { x: segments[0]!.start.x, y: segments[0]!.start.y },
  ];
  for (const seg of segments) {
    pts.push({ x: seg.end.x, y: seg.end.y });
  }
  return pts;
}

/**
 * Arc length along orthogonal polyline from start to closest point on polyline to (wx, wy).
 */
export function arcLengthAlongWireToPoint(
  segments: WireSegment[],
  wx: number,
  wy: number,
): number {
  const pts = segmentsToPolylinePoints(segments);
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

/**
 * First / last component pin along drawn polyline (for `wire.current` and animation endpoints).
 */
export function orderedComponentEndpointsForWire(
  wire: Pick<InteractiveWireConnection, "nodes" | "segments">,
): { first: WireNode | undefined; second: WireNode | undefined } {
  const comps = wire.nodes.filter(
    (n) => n.type === "component" && n.componentId && n.nodeId,
  ) as WireNode[];
  if (comps.length === 0) return { first: undefined, second: undefined };
  if (comps.length === 1) return { first: comps[0], second: undefined };
  if (!wire.segments?.length) {
    return { first: comps[0], second: comps[1] };
  }
  const sorted = [...comps].sort(
    (a, b) =>
      arcLengthAlongWireToPoint(wire.segments, a.x, a.y) -
      arcLengthAlongWireToPoint(wire.segments, b.x, b.y),
  );
  return { first: sorted[0], second: sorted[sorted.length - 1] };
}
