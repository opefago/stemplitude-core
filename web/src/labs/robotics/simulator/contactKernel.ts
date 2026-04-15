import type { SimulatorSceneObject } from "./types";

export interface ContactCandidate {
  object: SimulatorSceneObject;
  centerX: number;
  centerY: number;
  width: number;
  depth: number;
  yawDeg: number;
}

export interface ContactManifold {
  objectId: string;
  object: SimulatorSceneObject;
  normalX: number;
  normalY: number;
  penetration: number;
  contactPointX: number;
  contactPointY: number;
  toi: number;
}

export interface SweepParams {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  radius: number;
  candidates: ContactCandidate[];
  minStepCm: number;
  maxSamples: number;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toWorldVector(localX: number, localY: number, yawDeg: number): { x: number; y: number } {
  const yawRad = toRadians(yawDeg);
  const cos = Math.cos(yawRad);
  const sin = Math.sin(yawRad);
  return {
    x: localX * cos - localY * sin,
    y: localX * sin + localY * cos,
  };
}

function toLocalPoint(px: number, py: number, centerX: number, centerY: number, yawDeg: number): { x: number; y: number } {
  const yawRad = toRadians(yawDeg);
  const cos = Math.cos(-yawRad);
  const sin = Math.sin(-yawRad);
  return {
    x: (px - centerX) * cos - (py - centerY) * sin,
    y: (px - centerX) * sin + (py - centerY) * cos,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function circleIntersectsAabbBroadphase(
  x: number,
  y: number,
  radius: number,
  candidate: ContactCandidate,
): boolean {
  const local = toLocalPoint(x, y, candidate.centerX, candidate.centerY, candidate.yawDeg);
  const halfW = candidate.width / 2;
  const halfD = candidate.depth / 2;
  return (
    local.x >= -halfW - radius &&
    local.x <= halfW + radius &&
    local.y >= -halfD - radius &&
    local.y <= halfD + radius
  );
}

export function computeCircleObbManifold(
  x: number,
  y: number,
  radius: number,
  candidate: ContactCandidate,
): ContactManifold | null {
  if (!circleIntersectsAabbBroadphase(x, y, radius, candidate)) return null;
  const local = toLocalPoint(x, y, candidate.centerX, candidate.centerY, candidate.yawDeg);
  const halfW = candidate.width / 2;
  const halfD = candidate.depth / 2;
  const nearestX = clamp(local.x, -halfW, halfW);
  const nearestY = clamp(local.y, -halfD, halfD);
  const deltaX = local.x - nearestX;
  const deltaY = local.y - nearestY;
  const distSq = deltaX * deltaX + deltaY * deltaY;
  if (distSq > radius * radius) return null;

  let normalLocalX = 0;
  let normalLocalY = 0;
  let penetration = 0;
  const dist = Math.sqrt(Math.max(1e-12, distSq));
  if (dist > 1e-6) {
    normalLocalX = deltaX / dist;
    normalLocalY = deltaY / dist;
    penetration = radius - dist;
  } else {
    const left = Math.abs(local.x + halfW);
    const right = Math.abs(halfW - local.x);
    const bottom = Math.abs(local.y + halfD);
    const top = Math.abs(halfD - local.y);
    const minEdge = Math.min(left, right, bottom, top);
    if (minEdge === left) {
      normalLocalX = -1;
      normalLocalY = 0;
      penetration = radius + left;
    } else if (minEdge === right) {
      normalLocalX = 1;
      normalLocalY = 0;
      penetration = radius + right;
    } else if (minEdge === bottom) {
      normalLocalX = 0;
      normalLocalY = -1;
      penetration = radius + bottom;
    } else {
      normalLocalX = 0;
      normalLocalY = 1;
      penetration = radius + top;
    }
  }

  const normalWorld = toWorldVector(normalLocalX, normalLocalY, candidate.yawDeg);
  const contactLocalX = nearestX;
  const contactLocalY = nearestY;
  const contactWorld = toWorldVector(contactLocalX, contactLocalY, candidate.yawDeg);

  return {
    objectId: candidate.object.id,
    object: candidate.object,
    normalX: normalWorld.x,
    normalY: normalWorld.y,
    penetration: Math.max(0, penetration),
    contactPointX: candidate.centerX + contactWorld.x,
    contactPointY: candidate.centerY + contactWorld.y,
    toi: 1,
  };
}

export function detectContactsAtPose(
  x: number,
  y: number,
  radius: number,
  candidates: ContactCandidate[],
): ContactManifold[] {
  const contacts: ContactManifold[] = [];
  for (const candidate of candidates) {
    const manifold = computeCircleObbManifold(x, y, radius, candidate);
    if (manifold) contacts.push(manifold);
  }
  return contacts;
}

export function sweepCircleContacts(params: SweepParams): ContactManifold[] {
  const direct = detectContactsAtPose(params.endX, params.endY, params.radius, params.candidates);
  const dx = params.endX - params.startX;
  const dy = params.endY - params.startY;
  const distance = Math.hypot(dx, dy);
  const samples = Math.min(
    params.maxSamples,
    Math.max(2, Math.ceil(distance / Math.max(0.25, params.minStepCm))),
  );
  let earliestT = direct.length > 0 ? 1 : Number.POSITIVE_INFINITY;
  let earliestContacts: ContactManifold[] = direct;
  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const contacts = detectContactsAtPose(
      params.startX + dx * t,
      params.startY + dy * t,
      params.radius,
      params.candidates,
    );
    if (contacts.length > 0) {
      earliestT = t;
      earliestContacts = contacts.map((entry) => ({ ...entry, toi: t }));
      break;
    }
  }
  if (!Number.isFinite(earliestT)) return [];
  return earliestContacts.map((entry) => ({ ...entry, toi: earliestT }));
}
