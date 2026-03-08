import { getObjectBehavior } from "./behaviors/ObjectBehaviorFactory";

/**
 * Shared dimension / bounding-box API.
 * Delegates to behavior layer; used by store (floor alignment), Scene (handles, ruler), and DesignMakerLab (marquee, export).
 */

export function getObjectDimensions(obj) {
  return getObjectBehavior(obj.type).getDimensions(obj);
}

export function getFloorY(type, geometry, rotation, scale) {
  return getObjectBehavior(type).getFloorY(type, geometry, rotation, scale);
}

export function getWorldBounds(type, geometry, rotation, scale, position) {
  return getObjectBehavior(type).getWorldBounds(
    type,
    geometry,
    rotation,
    scale,
    position,
  );
}

/**
 * Half-extents [hx, hy, hz] for the given type/geometry. Delegates to behavior;
 * if the behavior has no getRawExtents, derives from getLocalBounds.
 */
export function getRawExtents(type, geometry) {
  const behavior = getObjectBehavior(type);
  if (typeof behavior.getRawExtents === "function") {
    const out = behavior.getRawExtents(type, geometry);
    if (out && Array.isArray(out) && out.length === 3) return out;
  }
  const b = behavior.getLocalBounds(type, geometry);
  return [
    (b.max[0] - b.min[0]) / 2,
    (b.max[1] - b.min[1]) / 2,
    (b.max[2] - b.min[2]) / 2,
  ];
}

export function overlapsXZ(a, b) {
  return (
    a.min[0] <= b.max[0] &&
    a.max[0] >= b.min[0] &&
    a.min[2] <= b.max[2] &&
    a.max[2] >= b.min[2]
  );
}
