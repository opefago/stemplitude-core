import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ---------------------------------------------------------------------------
// Shape helpers (exported for anyone who needs the raw 2D profile)
// ---------------------------------------------------------------------------

export function createHeartShape(size = 10) {
  const s = size;
  const shape = new THREE.Shape();
  shape.moveTo(0, s * 0.3);
  shape.bezierCurveTo(0, s * 0.5, -s * 0.5, s * 0.7, -s * 0.5, s * 0.3);
  shape.bezierCurveTo(-s * 0.5, -s * 0.1, 0, -s * 0.3, 0, -s * 0.6);
  shape.bezierCurveTo(0, -s * 0.3, s * 0.5, -s * 0.1, s * 0.5, s * 0.3);
  shape.bezierCurveTo(s * 0.5, s * 0.7, 0, s * 0.5, 0, s * 0.3);
  return shape;
}

export function createStarShape(outer = 10, inner = 5, points = 5) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

// ---------------------------------------------------------------------------
// Edge-variant helpers
// ---------------------------------------------------------------------------

export function createFilletBoxGeometry(width, height, depth, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  const hw = width / 2 - r;
  const hh = height / 2 - r;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, hh + r);
  shape.quadraticCurveTo(-hw - r, hh + r, -hw - r, hh);
  shape.lineTo(-hw - r, -hh);
  shape.quadraticCurveTo(-hw - r, -hh - r, -hw, -hh - r);
  shape.lineTo(hw, -hh - r);
  shape.quadraticCurveTo(hw + r, -hh - r, hw + r, -hh);
  shape.lineTo(hw + r, hh);
  shape.quadraticCurveTo(hw + r, hh + r, hw, hh + r);
  shape.lineTo(-hw, hh + r);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: Math.max(3, Math.ceil(r * 2)),
    curveSegments: Math.max(4, Math.ceil(r * 2)),
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateX(Math.PI / 2);
  return geo;
}

export function createChamferBoxGeometry(width, height, depth, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  const hw = width / 2 - r;
  const hh = height / 2 - r;
  const shape = new THREE.Shape();
  shape.moveTo(-hw, hh + r);
  shape.lineTo(-hw - r, hh);
  shape.lineTo(-hw - r, -hh);
  shape.lineTo(-hw, -hh - r);
  shape.lineTo(hw, -hh - r);
  shape.lineTo(hw + r, -hh);
  shape.lineTo(hw + r, hh);
  shape.lineTo(hw, hh + r);
  shape.lineTo(-hw, hh + r);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateX(Math.PI / 2);
  return geo;
}

export function createFilletCylinderGeometry(
  radiusTop,
  radiusBottom,
  height,
  radialSegments,
  edgeRadius,
) {
  const r = Math.min(edgeRadius, height / 2, radiusTop, radiusBottom);
  const halfH = height / 2;
  const pts = [];
  const segments = Math.max(4, Math.ceil(r * 2));
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * (Math.PI / 2);
    pts.push(
      new THREE.Vector2(
        radiusTop - r + Math.cos(t) * r,
        halfH - r + Math.sin(t) * r,
      ),
    );
  }
  const bodySegments = 4;
  for (let i = 1; i <= bodySegments; i++) {
    const t = i / bodySegments;
    const rad = radiusTop + (radiusBottom - radiusTop) * t;
    const y = halfH - t * height;
    if (i < bodySegments) pts.push(new THREE.Vector2(rad, y));
  }
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * (Math.PI / 2);
    pts.push(
      new THREE.Vector2(
        radiusBottom - r + Math.cos(Math.PI / 2 - t) * r,
        -halfH + r - Math.sin(Math.PI / 2 - t) * r,
      ),
    );
  }
  return new THREE.LatheGeometry(pts, radialSegments || 32);
}

export function createChamferCylinderGeometry(
  radiusTop,
  radiusBottom,
  height,
  radialSegments,
  edgeRadius,
) {
  const r = Math.min(edgeRadius, height / 2, radiusTop, radiusBottom);
  const halfH = height / 2;
  const pts = [
    new THREE.Vector2(radiusTop - r, halfH),
    new THREE.Vector2(radiusTop, halfH - r),
    new THREE.Vector2(radiusBottom, -halfH + r),
    new THREE.Vector2(radiusBottom - r, -halfH),
  ];
  return new THREE.LatheGeometry(pts, radialSegments || 32);
}

// ---------------------------------------------------------------------------
// Geometry creator registry — add new shapes by calling registerShape()
// ---------------------------------------------------------------------------

const creators = new Map();

/**
 * Register a geometry creator for a shape type.
 * `aliases` lets multiple type keys share one creator (e.g. box & wall).
 */
export function registerShape(type, creator, aliases = []) {
  creators.set(type, creator);
  for (const alias of aliases) creators.set(alias, creator);
}

/**
 * Unified geometry factory. Every consumer (Scene, CSG, export, icons)
 * MUST use this function to ensure consistency.
 */
export function createGeometry(type, params) {
  const creator = creators.get(type);
  if (creator) return creator(params);
  return new THREE.BoxGeometry(20, 20, 20);
}

// ---------------------------------------------------------------------------
// Built-in shape registrations
// ---------------------------------------------------------------------------

registerShape(
  "box",
  (p) => {
    if (p.edgeRadius > 0 && p.edgeStyle === "fillet")
      return createFilletBoxGeometry(p.width, p.height, p.depth, p.edgeRadius);
    if (p.edgeRadius > 0 && p.edgeStyle === "chamfer")
      return createChamferBoxGeometry(p.width, p.height, p.depth, p.edgeRadius);
    return new THREE.BoxGeometry(p.width, p.height, p.depth);
  },
  ["wall"],
);

registerShape(
  "sphere",
  (p) =>
    new THREE.SphereGeometry(
      p.radius,
      p.widthSegments || 32,
      p.heightSegments || 32,
    ),
);

registerShape("cylinder", (p) => {
  if (p.edgeRadius > 0 && p.edgeStyle === "fillet")
    return createFilletCylinderGeometry(
      p.radiusTop,
      p.radiusBottom,
      p.height,
      p.radialSegments || 32,
      p.edgeRadius,
    );
  if (p.edgeRadius > 0 && p.edgeStyle === "chamfer")
    return createChamferCylinderGeometry(
      p.radiusTop,
      p.radiusBottom,
      p.height,
      p.radialSegments || 32,
      p.edgeRadius,
    );
  return new THREE.CylinderGeometry(
    p.radiusTop,
    p.radiusBottom,
    p.height,
    p.radialSegments || 32,
  );
});

registerShape(
  "cone",
  (p) => new THREE.ConeGeometry(p.radius, p.height, p.radialSegments || 32),
  ["pyramid"],
);

registerShape(
  "torus",
  (p) =>
    new THREE.TorusGeometry(
      p.radius,
      p.tube,
      p.radialSegments || 16,
      p.tubularSegments || 48,
    ),
  ["tube"],
);

registerShape("hemisphere", (p) => {
  const dome = new THREE.SphereGeometry(
    p.radius,
    32,
    16,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  const cap = new THREE.CircleGeometry(p.radius, 32);
  cap.rotateX(Math.PI / 2);
  const geo = mergeGeometries([dome, cap]);
  geo.translate(0, -p.radius / 2, 0);
  return geo;
});

registerShape("heart", (p) => {
  const shape = createHeartShape(p.size);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: p.depth,
    bevelEnabled: true,
    bevelThickness: 0.5,
    bevelSize: 0.3,
    bevelSegments: 3,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(0, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
  return geo;
});

registerShape("star", (p) => {
  const shape = createStarShape(p.outerRadius, p.innerRadius, p.points);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: p.depth,
    bevelEnabled: true,
    bevelThickness: 0.5,
    bevelSize: 0.3,
    bevelSegments: 3,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(0, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
  return geo;
});

registerShape("wedge", (p) => {
  const w = p.width / 2,
    hh = p.height / 2,
    d = p.depth / 2;
  const positions = new Float32Array([
    -w,
    -hh,
    d,
    w,
    -hh,
    d,
    w,
    -hh,
    -d,
    -w,
    -hh,
    -d,
    w,
    hh,
    -d,
    -w,
    hh,
    -d,
  ]);
  const indices = [
    0, 2, 1, 0, 3, 2, 3, 5, 4, 3, 4, 2, 0, 1, 4, 0, 4, 5, 0, 5, 3, 1, 2, 4,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
});

// ---------------------------------------------------------------------------
// Platonic solids
// ---------------------------------------------------------------------------

registerShape("tetrahedron", (p) => new THREE.TetrahedronGeometry(p.radius));

registerShape("dodecahedron", (p) => new THREE.DodecahedronGeometry(p.radius));

registerShape("octahedron", (p) => new THREE.OctahedronGeometry(p.radius));

registerShape("icosahedron", (p) => new THREE.IcosahedronGeometry(p.radius));

// ---------------------------------------------------------------------------
// Prisms (polygon-cross-section cylinders)
// ---------------------------------------------------------------------------

registerShape(
  "triangularPrism",
  (p) => new THREE.CylinderGeometry(p.radius, p.radius, p.height, 3),
);

registerShape(
  "hexagonalPrism",
  (p) => new THREE.CylinderGeometry(p.radius, p.radius, p.height, 6),
);

registerShape(
  "pentagonalPrism",
  (p) => new THREE.CylinderGeometry(p.radius, p.radius, p.height, 5),
);

// ---------------------------------------------------------------------------
// Pyramids
// ---------------------------------------------------------------------------

registerShape(
  "pentagonalPyramid",
  (p) => new THREE.ConeGeometry(p.radius, p.height, 5),
);

registerShape(
  "squarePyramid",
  (p) => new THREE.ConeGeometry(p.radius, p.height, 4),
);

// ---------------------------------------------------------------------------
// Curved / special shapes
// ---------------------------------------------------------------------------

registerShape("ellipsoid", (p) => {
  const geo = new THREE.SphereGeometry(1, 32, 32);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) * p.radiusX,
      pos.getY(i) * p.radiusY,
      pos.getZ(i) * p.radiusZ,
    );
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
});

registerShape("ring", (p) => {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, p.outerRadius, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, p.innerRadius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: p.height,
    bevelEnabled: false,
    curveSegments: 48,
  });
  geo.translate(0, 0, -p.height / 2);
  return geo;
});

registerShape("paraboloid", (p) => {
  const pts = [];
  const steps = 32;
  pts.push(new THREE.Vector2(0, -p.height / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * p.height - p.height / 2;
    const r = p.radius * Math.sqrt(t);
    pts.push(new THREE.Vector2(r, y));
  }
  return new THREE.LatheGeometry(pts, 32);
});

const starExtrudeCreator = (p) => {
  const shape = createStarShape(p.outerRadius, p.innerRadius, p.points);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: p.depth,
    bevelEnabled: true,
    bevelThickness: 0.5,
    bevelSize: 0.3,
    bevelSegments: 3,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(0, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
  return geo;
};

registerShape("starSix", starExtrudeCreator);

registerShape(
  "imported",
  (p) => p.bufferGeometry || new THREE.BoxGeometry(20, 20, 20),
);
