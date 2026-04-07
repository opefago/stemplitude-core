/**
 * Orthogonal wire stroke with rounded corners (render-only; geometry stays orthogonal).
 */

import type { Graphics } from "pixi.js";
import type { WireSegment } from "../../InteractiveWireSystem";
import { DesignTokens } from "../../rendering/DesignTokens";

const DEFAULT_FILLET = 6;

/**
 * Draw multi-segment orthogonal path with slight rounding at bends.
 */
export function drawRoundedOrthoWire(
  g: Graphics,
  segments: WireSegment[],
  stroke: { width: number; color: number; alpha?: number },
  filletRadius = DEFAULT_FILLET,
): void {
  if (segments.length === 0) return;

  const pts: { x: number; y: number }[] = [{ x: segments[0].start.x, y: segments[0].start.y }];
  for (const s of segments) {
    pts.push({ x: s.end.x, y: s.end.y });
  }

  if (pts.length < 2) return;

  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    const next = pts[i + 1]!;

    const d1x = cur.x - prev.x;
    const d1y = cur.y - prev.y;
    const d2x = next.x - cur.x;
    const d2y = next.y - cur.y;
    const len1 = Math.hypot(d1x, d1y) || 1;
    const len2 = Math.hypot(d2x, d2y) || 1;
    const r = Math.min(filletRadius, len1 / 2, len2 / 2);

    if (r < 0.5 || (d1x !== 0 && d2x !== 0) || (d1y !== 0 && d2y !== 0)) {
      g.lineTo(cur.x, cur.y);
      continue;
    }

    const ox1 = (d1x / len1) * r;
    const oy1 = (d1y / len1) * r;
    const ox2 = (d2x / len2) * r;
    const oy2 = (d2y / len2) * r;

    const cx = cur.x;
    const cy = cur.y;
    g.lineTo(cx - ox1, cy - oy1);
    g.quadraticCurveTo(cx, cy, cx + ox2, cy + oy2);
  }
  const last = pts[pts.length - 1]!;
  g.lineTo(last.x, last.y);

  g.stroke({
    width: stroke.width,
    color: stroke.color,
    alpha: stroke.alpha ?? 1,
    cap: "round",
    join: "round",
  });
}

export function drawWireHitPath(
  g: Graphics,
  segments: WireSegment[],
  hitWidth: number,
): void {
  for (const s of segments) {
    g.moveTo(s.start.x, s.start.y);
    g.lineTo(s.end.x, s.end.y);
    g.stroke({ width: hitWidth, color: 0x000000, alpha: 0.001, cap: "round" });
  }
}

export function schematicHitStrokeWidth(): number {
  return DesignTokens.wire.thickness * 4;
}

export function schematicCornerRadius(): number {
  return DEFAULT_FILLET;
}
