import {
  Evaluator,
  Brush,
  ADDITION,
  SUBTRACTION,
  INTERSECTION,
} from "three-bvh-csg";
import * as THREE from "three";
import {
  mergeVertices,
  toCreasedNormals,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createGeometry } from "./geometryFactory";

const evaluator = new Evaluator();
// Keep evaluator attributes aligned with prepareBrushGeometry().
// We rebuild normals after CSG anyway, and UVs are not needed for these solids.
evaluator.attributes = ["position"];
const CURVED_CSG_TYPES = new Set([
  "sphere",
  "cylinder",
  "capsule",
  "cone",
  "torus",
  "tube",
  "hemisphere",
  "ellipsoid",
  "ring",
  "paraboloid",
]);

function upgradeCSGParams(type, geometry = {}) {
  const params = { ...geometry };
  switch (type) {
    case "sphere":
      params.widthSegments = Math.max(params.widthSegments || 0, 48);
      params.heightSegments = Math.max(params.heightSegments || 0, 32);
      break;
    case "cylinder":
      params.radialSegments = Math.max(params.radialSegments || 0, 64);
      break;
    case "capsule":
      params.radialSegments = Math.max(params.radialSegments || 0, 64);
      params.capSegments = Math.max(params.capSegments || 0, 4);
      break;
    case "cone":
      params.radialSegments = Math.max(params.radialSegments || 0, 64);
      break;
    case "torus":
    case "tube":
      params.radialSegments = Math.max(params.radialSegments || 0, 24);
      params.tubularSegments = Math.max(params.tubularSegments || 0, 96);
      break;
    case "hemisphere":
      params.widthSegments = Math.max(params.widthSegments || 0, 48);
      params.heightSegments = Math.max(params.heightSegments || 0, 24);
      params.capSegments = Math.max(params.capSegments || 0, 48);
      break;
    case "ellipsoid":
      params.widthSegments = Math.max(params.widthSegments || 0, 48);
      params.heightSegments = Math.max(params.heightSegments || 0, 32);
      break;
    case "ring":
      params.curveSegments = Math.max(params.curveSegments || 0, 96);
      break;
    case "paraboloid":
      params.profileSteps = Math.max(params.profileSteps || 0, 64);
      params.radialSegments = Math.max(params.radialSegments || 0, 64);
      break;
    default:
      break;
  }
  return params;
}

function prepareBrushGeometry(obj) {
  const base = createGeometry(
    obj.type,
    upgradeCSGParams(obj.type, obj.geometry),
  );
  let geometry = base.clone();
  if (!geometry.attributes?.position) {
    throw new Error(`CSG source geometry for "${obj.type}" has no position attribute.`);
  }

  // Keep CSG input attributes consistent across all brushes.
  // This avoids evaluator crashes when one geometry has extra attrs
  // (e.g. surfaceId from outline experiments) and another doesn't.
  Object.keys(geometry.attributes).forEach((key) => {
    if (key !== "position") geometry.deleteAttribute(key);
  });

  // three-bvh-csg expects indexed geometry in several code paths.
  if (!geometry.index) {
    const indexed = mergeVertices(geometry, 1e-6);
    geometry.dispose();
    geometry = indexed;
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function finalizeResultBrush(result) {
  if (!result?.geometry) return result;
  const source = result.geometry;
  // Drop seam-splitting attributes before welding so curved hole walls smooth.
  const prep = source.index ? source.toNonIndexed() : source.clone();
  prep.deleteAttribute("normal");
  prep.deleteAttribute("uv");
  prep.deleteAttribute("uv2");
  prep.computeBoundingBox();
  const bb = prep.boundingBox;
  const maxDim = bb
    ? Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z)
    : 1;
  const weldTolerance = Math.max(2e-4, maxDim * 2e-4);
  const welded = mergeVertices(prep, weldTolerance);
  welded.deleteAttribute("normal");
  welded.computeVertexNormals();
  const smoothed = toCreasedNormals(welded, Math.PI / 3.5);
  smoothed.computeBoundingBox();
  smoothed.computeBoundingSphere();
  prep.dispose();
  if (source !== welded) source.dispose();
  if (smoothed !== welded) welded.dispose();
  result.geometry = smoothed;
  return result;
}

function createBrush(obj) {
  const geometry = prepareBrushGeometry(obj);
  const material = new THREE.MeshStandardMaterial({ color: obj.color });
  const brush = new Brush(geometry, material);
  brush.position.set(...obj.position);
  brush.rotation.set(...obj.rotation);
  brush.scale.set(...obj.scale);
  brush.updateMatrixWorld(true);
  return brush;
}

export function unionCSG(objectsData) {
  if (objectsData.length < 2) return null;

  let result = createBrush(objectsData[0]);
  for (let i = 1; i < objectsData.length; i++) {
    const brush = createBrush(objectsData[i]);
    result = evaluator.evaluate(result, brush, ADDITION);
  }
  return finalizeResultBrush(result);
}

/**
 * Hole-aware merge: union all solids together, then subtract all holes.
 * Falls back to plain union if there are no holes, or plain subtract
 * if there is only one solid.
 */
export function mergeCSG(objectsData) {
  const solids = objectsData.filter((o) => !o.isHole);
  const holes = objectsData.filter((o) => o.isHole);

  if (solids.length === 0) return null;

  let result = createBrush(solids[0]);
  for (let i = 1; i < solids.length; i++) {
    const brush = createBrush(solids[i]);
    result = evaluator.evaluate(result, brush, ADDITION);
  }

  for (const hole of holes) {
    const brush = createBrush(hole);
    result = evaluator.evaluate(result, brush, SUBTRACTION);
  }

  return finalizeResultBrush(result);
}

export function subtractCSG(targetData, toolsData) {
  if (!targetData || toolsData.length === 0) return null;

  let result = createBrush(targetData);
  for (const tool of toolsData) {
    const brush = createBrush(tool);
    result = evaluator.evaluate(result, brush, SUBTRACTION);
  }
  return finalizeResultBrush(result);
}

export function intersectCSG(objectsData) {
  if (objectsData.length < 2) return null;

  let result = createBrush(objectsData[0]);
  for (let i = 1; i < objectsData.length; i++) {
    const brush = createBrush(objectsData[i]);
    result = evaluator.evaluate(result, brush, INTERSECTION);
  }
  return finalizeResultBrush(result);
}
