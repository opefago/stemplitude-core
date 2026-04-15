import type { MeasurementPose } from "./types";

export function normalizeHeadingDeg(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function signedAngleDeltaDeg(fromDeg: number, toDeg: number): number {
  const from = normalizeHeadingDeg(fromDeg);
  const to = normalizeHeadingDeg(toDeg);
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

export function planarDistanceCm(
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.hypot(dx, dz);
}

export function headingFromPointsDeg(
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return 0;
  return normalizeHeadingDeg((Math.atan2(dz, dx) * 180) / Math.PI);
}

export function midpoint3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

export function shouldAcceptSample(
  previous: MeasurementPose,
  next: MeasurementPose,
  minDistanceCm: number,
  minHeadingDeltaDeg = 0.75,
): boolean {
  const moved = planarDistanceCm(previous, next) >= minDistanceCm;
  if (moved) return true;
  return Math.abs(signedAngleDeltaDeg(previous.headingDeg, next.headingDeg)) >= minHeadingDeltaDeg;
}

export function toPosition3(pose: MeasurementPose, y = 0): { x: number; y: number; z: number } {
  return {
    x: Number(pose.x) || 0,
    y: Number.isFinite(Number(pose.y)) ? Number(pose.y) : y,
    z: Number(pose.z) || 0,
  };
}

