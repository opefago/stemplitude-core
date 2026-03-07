import * as THREE from "three";

/**
 * Shared dimension / bounding-box helpers.
 * Used by store (floor alignment), Scene (handles, ruler), and DesignMakerLab (marquee, export).
 */

export function getRawExtents(type, geometry) {
  let hx, hy, hz;
  switch (type) {
    case "box":
    case "wall":
    case "wedge":
      hx = geometry.width / 2;
      hy = geometry.height / 2;
      hz = geometry.depth / 2;
      break;
    case "sphere":
      hx = hy = hz = geometry.radius;
      break;
    case "hemisphere":
      hx = hz = geometry.radius;
      hy = geometry.radius / 2;
      break;
    case "cylinder":
      hx = hz = Math.max(geometry.radiusTop, geometry.radiusBottom);
      hy = geometry.height / 2;
      break;
    case "cone":
    case "pyramid":
      hx = hz = geometry.radius;
      hy = geometry.height / 2;
      break;
    case "torus":
    case "tube":
      hx = geometry.radius + geometry.tube;
      hy = geometry.radius + geometry.tube;
      hz = geometry.tube;
      break;
    case "heart":
      hx = geometry.size * 0.55;
      hy = geometry.size * 0.7;
      hz = (geometry.depth + 1.0) / 2;
      break;
    case "star":
    case "starSix":
      hx = geometry.outerRadius;
      hy = geometry.outerRadius;
      hz = (geometry.depth + 1.0) / 2;
      break;
    case "text":
      hx = Math.max(
        geometry.size || 10,
        (geometry.text || "Text").length * (geometry.size || 10) * 0.3,
      );
      hy = (geometry.size || 10) / 2;
      hz = ((geometry.height || 5) + 0.6) / 2;
      break;
    case "tetrahedron":
      hx = hy = hz = geometry.radius * 0.57735;
      break;
    case "dodecahedron":
      hx = hy = hz = geometry.radius * 0.93417;
      break;
    case "octahedron":
      hx = hy = hz = geometry.radius;
      break;
    case "icosahedron":
      hx = hy = hz = geometry.radius * 0.85065;
      break;
    case "ellipsoid":
      hx = geometry.radiusX;
      hy = geometry.radiusY;
      hz = geometry.radiusZ;
      break;
    case "triangularPrism":
    case "hexagonalPrism":
    case "pentagonalPrism":
      hx = hz = geometry.radius;
      hy = geometry.height / 2;
      break;
    case "pentagonalPyramid":
    case "squarePyramid":
      hx = hz = geometry.radius;
      hy = geometry.height / 2;
      break;
    case "ring":
      hx = geometry.outerRadius;
      hy = geometry.outerRadius;
      hz = geometry.height / 2;
      break;
    case "paraboloid":
      hx = hz = geometry.radius;
      hy = geometry.height / 2;
      break;
    case "imported":
      if (geometry.bufferGeometry) {
        if (!geometry.bufferGeometry.boundingBox)
          geometry.bufferGeometry.computeBoundingBox();
        const bb = geometry.bufferGeometry.boundingBox;
        hx = (bb.max.x - bb.min.x) / 2;
        hy = (bb.max.y - bb.min.y) / 2;
        hz = (bb.max.z - bb.min.z) / 2;
      } else {
        hx = hy = hz = 10;
      }
      break;
    default:
      hx = hy = hz = 10;
  }
  return [hx, hy, hz];
}

function getLocalBounds(type, geometry) {
  if (type === "imported" && geometry?.bufferGeometry) {
    const bg = geometry.bufferGeometry;
    if (!bg.boundingBox) bg.computeBoundingBox();
    const bb = bg.boundingBox;
    return {
      min: [bb.min.x, bb.min.y, bb.min.z],
      max: [bb.max.x, bb.max.y, bb.max.z],
    };
  }

  const [hx, hy, hz] = getRawExtents(type, geometry);
  return {
    min: [-hx, -hy, -hz],
    max: [hx, hy, hz],
  };
}

const POLYHEDRON_VERTEX_CACHE = new Map();

function getPolyhedronVertices(type, radius) {
  const key = `${type}:${radius}`;
  if (POLYHEDRON_VERTEX_CACHE.has(key)) return POLYHEDRON_VERTEX_CACHE.get(key);

  let geo;
  switch (type) {
    case "tetrahedron":
      geo = new THREE.TetrahedronGeometry(radius);
      break;
    case "dodecahedron":
      geo = new THREE.DodecahedronGeometry(radius);
      break;
    case "octahedron":
      geo = new THREE.OctahedronGeometry(radius);
      break;
    case "icosahedron":
      geo = new THREE.IcosahedronGeometry(radius);
      break;
    default:
      return null;
  }

  const pos = geo.attributes.position;
  const verts = [];
  for (let i = 0; i < pos.count; i++) {
    verts.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  }
  geo.dispose();
  POLYHEDRON_VERTEX_CACHE.set(key, verts);
  return verts;
}

function getExactLocalVertices(type, geometry) {
  switch (type) {
    case "tetrahedron":
    case "dodecahedron":
    case "octahedron":
    case "icosahedron":
      return getPolyhedronVertices(type, geometry.radius || 10);
    default:
      return null;
  }
}

export function getFloorY(type, geometry, rotation, scale) {
  const localBounds = getLocalBounds(type, geometry);
  const exactVerts = getExactLocalVertices(type, geometry);
  const sx = scale ? Math.abs(scale[0]) : 1;
  const sy = scale ? Math.abs(scale[1]) : 1;
  const sz = scale ? Math.abs(scale[2]) : 1;

  if (
    !rotation ||
    (rotation[0] === 0 && rotation[1] === 0 && rotation[2] === 0)
  ) {
    if (exactVerts) {
      let minY = Infinity;
      for (const [, y] of exactVerts) {
        const yy = y * sy;
        if (yy < minY) minY = yy;
      }
      return -minY;
    }
    return -localBounds.min[1] * sy;
  }

  const [rx, ry, rz] = rotation;
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rx, ry, rz, "XYZ"),
  );
  const v = new THREE.Vector3();

  const minX = localBounds.min[0] * sx;
  const minY0 = localBounds.min[1] * sy;
  const minZ = localBounds.min[2] * sz;
  const maxX = localBounds.max[0] * sx;
  const maxY0 = localBounds.max[1] * sy;
  const maxZ = localBounds.max[2] * sz;
  const corners = [
    [minX, minY0, minZ],
    [maxX, minY0, minZ],
    [minX, maxY0, minZ],
    [maxX, maxY0, minZ],
    [minX, minY0, maxZ],
    [maxX, minY0, maxZ],
    [minX, maxY0, maxZ],
    [maxX, maxY0, maxZ],
  ];

  const sourcePoints = exactVerts
    ? exactVerts.map(([x, y, z]) => [x * sx, y * sy, z * sz])
    : corners;
  let minY = Infinity;
  for (const [x, y, z] of sourcePoints) {
    v.set(x, y, z).applyQuaternion(q);
    if (v.y < minY) minY = v.y;
  }

  return -minY;
}

export function getWorldBounds(type, geometry, rotation, scale, position) {
  const localBounds = getLocalBounds(type, geometry);
  const exactVerts = getExactLocalVertices(type, geometry);
  const sx = scale ? Math.abs(scale[0]) : 1;
  const sy = scale ? Math.abs(scale[1]) : 1;
  const sz = scale ? Math.abs(scale[2]) : 1;
  const [px, py, pz] = position || [0, 0, 0];

  const [rx, ry, rz] = rotation || [0, 0, 0];
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rx, ry, rz, "XYZ"),
  );
  const v = new THREE.Vector3();

  const minX0 = localBounds.min[0] * sx;
  const minY0 = localBounds.min[1] * sy;
  const minZ0 = localBounds.min[2] * sz;
  const maxX0 = localBounds.max[0] * sx;
  const maxY0 = localBounds.max[1] * sy;
  const maxZ0 = localBounds.max[2] * sz;
  const corners = [
    [minX0, minY0, minZ0],
    [maxX0, minY0, minZ0],
    [minX0, maxY0, minZ0],
    [maxX0, maxY0, minZ0],
    [minX0, minY0, maxZ0],
    [maxX0, minY0, maxZ0],
    [minX0, maxY0, maxZ0],
    [maxX0, maxY0, maxZ0],
  ];

  const sourcePoints = exactVerts
    ? exactVerts.map(([x, y, z]) => [x * sx, y * sy, z * sz])
    : corners;

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (const [x, y, z] of sourcePoints) {
    v.set(x, y, z).applyQuaternion(q);
    const wx = v.x + px;
    const wy = v.y + py;
    const wz = v.z + pz;

    if (wx < minX) minX = wx;
    if (wy < minY) minY = wy;
    if (wz < minZ) minZ = wz;
    if (wx > maxX) maxX = wx;
    if (wy > maxY) maxY = wy;
    if (wz > maxZ) maxZ = wz;
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}

export function overlapsXZ(a, b) {
  return (
    a.min[0] <= b.max[0] &&
    a.max[0] >= b.min[0] &&
    a.min[2] <= b.max[2] &&
    a.max[2] >= b.min[2]
  );
}

/**
 * UI-facing object dimensions (for handles, ruler, workplane sizing).
 * Uses generous bounds for usability — intentionally different from
 * getRawExtents which is tighter and used for physics/floor alignment.
 */
export function getObjectDimensions(obj) {
  const g = obj.geometry;
  const s = obj.scale;
  let w, h, d;
  switch (obj.type) {
    case "box":
    case "wall":
    case "wedge":
      w = g.width;
      h = g.height;
      d = g.depth;
      break;
    case "sphere":
      w = g.radius * 2;
      h = g.radius * 2;
      d = g.radius * 2;
      break;
    case "hemisphere":
      w = g.radius * 2;
      h = g.radius;
      d = g.radius * 2;
      break;
    case "cylinder":
      w = Math.max(g.radiusTop, g.radiusBottom) * 2;
      h = g.height;
      d = Math.max(g.radiusTop, g.radiusBottom) * 2;
      break;
    case "cone":
    case "pyramid":
      w = g.radius * 2;
      h = g.height;
      d = g.radius * 2;
      break;
    case "torus":
    case "tube":
      w = (g.radius + g.tube) * 2;
      h = g.tube * 2;
      d = (g.radius + g.tube) * 2;
      break;
    case "heart":
      w = g.size * 2;
      h = g.size * 2;
      d = g.depth;
      break;
    case "star":
    case "starSix":
      w = g.outerRadius * 2;
      h = g.outerRadius * 2;
      d = g.depth;
      break;
    case "text":
      w = 20;
      h = g.size || 10;
      d = g.height || 5;
      break;
    case "tetrahedron":
    case "dodecahedron":
    case "octahedron":
    case "icosahedron":
      w = g.radius * 2;
      h = g.radius * 2;
      d = g.radius * 2;
      break;
    case "ellipsoid":
      w = g.radiusX * 2;
      h = g.radiusY * 2;
      d = g.radiusZ * 2;
      break;
    case "triangularPrism":
    case "hexagonalPrism":
    case "pentagonalPrism":
      w = g.radius * 2;
      h = g.height;
      d = g.radius * 2;
      break;
    case "pentagonalPyramid":
    case "squarePyramid":
      w = g.radius * 2;
      h = g.height;
      d = g.radius * 2;
      break;
    case "ring":
      w = g.outerRadius * 2;
      h = g.outerRadius * 2;
      d = g.height;
      break;
    case "paraboloid":
      w = g.radius * 2;
      h = g.height;
      d = g.radius * 2;
      break;
    case "imported":
      if (g.bufferGeometry) {
        if (!g.bufferGeometry.boundingBox)
          g.bufferGeometry.computeBoundingBox();
        const bb = g.bufferGeometry.boundingBox;
        w = bb.max.x - bb.min.x;
        h = bb.max.y - bb.min.y;
        d = bb.max.z - bb.min.z;
      } else {
        w = 20;
        h = 20;
        d = 20;
      }
      break;
    default:
      w = 20;
      h = 20;
      d = 20;
  }
  return {
    width: Math.abs(w * s[0]),
    height: Math.abs(h * s[1]),
    depth: Math.abs(d * s[2]),
  };
}
