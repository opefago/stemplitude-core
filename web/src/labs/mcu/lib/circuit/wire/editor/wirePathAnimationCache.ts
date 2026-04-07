/**
 * Arc-length tables + stable segment IDs for current-flow animation.
 */

import type { Point } from "../../types/ComponentTypes";
import type { WireSegment } from "../../InteractiveWireSystem";

export type WireAnimationPathMeta = {
  wireId: string;
  segmentIds: string[];
  revision: number;
  worldPoints: Point[];
  totalLength: number;
  segmentLengths: number[];
  segmentCumulativeLengths: number[];
};

function fract01(x: number): number {
  return x - Math.floor(x);
}

export function assignStableSegmentIds(
  wireId: string,
  segments: WireSegment[],
  existingIds: string[] | undefined,
  revision: number,
): string[] {
  if (!existingIds || existingIds.length !== segments.length) {
    return segments.map((_, i) => `${wireId}:seg${i}:r${revision}`);
  }
  const next: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const keep = existingIds[i];
    next.push(
      keep && keep.startsWith(`${wireId}:`)
        ? keep
        : `${wireId}:seg${i}:r${revision}`,
    );
  }
  return next;
}

export function buildAnimationPathMeta(
  wireId: string,
  segments: WireSegment[],
  segmentIds: string[],
  revision: number,
): WireAnimationPathMeta {
  const worldPoints: Point[] = [];
  if (segments.length > 0) {
    worldPoints.push({ x: segments[0].start.x, y: segments[0].start.y });
    for (const s of segments) {
      worldPoints.push({ x: s.end.x, y: s.end.y });
    }
  }

  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (const s of segments) {
    const len =
      Math.abs(s.end.x - s.start.x) + Math.abs(s.end.y - s.start.y);
    segmentLengths.push(len);
    totalLength += len;
  }

  const segmentCumulativeLengths: number[] = [0];
  let acc = 0;
  for (const len of segmentLengths) {
    acc += len;
    segmentCumulativeLengths.push(acc);
  }

  return {
    wireId,
    segmentIds: [...segmentIds],
    revision,
    worldPoints,
    totalLength,
    segmentLengths,
    segmentCumulativeLengths,
  };
}

export { fract01 };
