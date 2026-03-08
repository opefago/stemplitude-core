/**
 * Single source of truth for each default shape type: axis params, scale params,
 * raw extents (bounds), and handle family. Keeps type-specific details in one place
 * and avoids scattered switches (registry / descriptor pattern used in many CAD/editor projects).
 *
 * @typedef {Object} ShapeTypeConfig
 * @property {[string, string, string]} axisParams - [paramX, paramY, paramZ] for scale handles
 * @property {[string|null, string|null, string|null]} [linkedParams] - optional linked param per axis (e.g. cylinder radiusTop)
 * @property {(g: Object) => [number, number, number]} getRawExtents - (geometry) => [hx, hy, hz] half-extents
 * @property {'boxLike'|'sphereLike'|'cylinderLike'|'radialHeight'|'prismLike'|'ellipsoidLike'|'ringLike'|'heartLike'|'starLike'} handleFamily
 * @property {{ param?: string, baseY?: number, topY?: number }} [handleOptions] - optional overrides for handle helper
 */

const boxLikeExtents = (g) => [
  g.width / 2,
  g.height / 2,
  g.depth / 2,
];

const sphereLikeExtents = (g) => [g.radius, g.radius, g.radius];

const radialHeightExtents = (g) => [
  g.radius,
  g.height / 2,
  g.radius,
];

const prismLikeExtents = (g) => [g.radius, g.height / 2, g.radius];

const torusTubeExtents = (g) => [
  g.radius + g.tube,
  g.radius + g.tube,
  g.tube,
];

/** @type {Record<string, ShapeTypeConfig>} */
const DEFAULT_SHAPE_TYPES = {
  box: {
    axisParams: ["width", "height", "depth"],
    getRawExtents: boxLikeExtents,
    handleFamily: "boxLike",
  },
  wall: {
    axisParams: ["width", "height", "depth"],
    getRawExtents: boxLikeExtents,
    handleFamily: "boxLike",
  },
  wedge: {
    axisParams: ["width", "height", "depth"],
    getRawExtents: boxLikeExtents,
    handleFamily: "boxLike",
  },
  sphere: {
    axisParams: ["radius", "radius", "radius"],
    getRawExtents: sphereLikeExtents,
    handleFamily: "sphereLike",
  },
  hemisphere: {
    axisParams: ["radius", "radius", "radius"],
    getRawExtents: (g) => [g.radius, g.radius / 2, g.radius],
    handleFamily: "sphereLike",
    handleOptions: {
      param: "radius",
      baseY: (g) => -g.radius / 2,
      topY: (g, o) => g.radius / 2 + o,
    },
  },
  cylinder: {
    axisParams: ["radiusBottom", "height", "radiusBottom"],
    linkedParams: ["radiusTop", null, "radiusTop"],
    getRawExtents: (g) => [
      Math.max(g.radiusTop, g.radiusBottom),
      g.height / 2,
      Math.max(g.radiusTop, g.radiusBottom),
    ],
    handleFamily: "cylinderLike",
  },
  cone: {
    axisParams: ["radius", "height", "radius"],
    getRawExtents: radialHeightExtents,
    handleFamily: "radialHeight",
  },
  capsule: {
    axisParams: ["radius", "height", "radius"],
    getRawExtents: radialHeightExtents,
    handleFamily: "radialHeight",
  },
  pyramid: {
    axisParams: ["radius", "height", "radius"],
    getRawExtents: radialHeightExtents,
    handleFamily: "radialHeight",
  },
  torus: {
    axisParams: ["radius", "radius", "tube"],
    getRawExtents: torusTubeExtents,
    handleFamily: "torusLike",
  },
  tube: {
    axisParams: ["radius", "radius", "tube"],
    getRawExtents: torusTubeExtents,
    handleFamily: "torusLike",
  },
  heart: {
    axisParams: ["size", "depth", "size"],
    getRawExtents: (g) => [g.size * 0.55, g.size * 0.7, (g.depth + 1) / 2],
    handleFamily: "heartLike",
  },
  star: {
    axisParams: ["outerRadius", "depth", "outerRadius"],
    getRawExtents: (g) => [g.outerRadius, g.outerRadius, (g.depth + 1) / 2],
    handleFamily: "starLike",
  },
  starSix: {
    axisParams: ["outerRadius", "depth", "outerRadius"],
    getRawExtents: (g) => [g.outerRadius, g.outerRadius, (g.depth + 1) / 2],
    handleFamily: "starLike",
  },
  tetrahedron: {
    axisParams: ["radius", "radius", "radius"],
    getRawExtents: (g) => [g.radius * 0.57735, g.radius * 0.57735, g.radius * 0.57735],
    handleFamily: "sphereLike",
  },
  dodecahedron: {
    axisParams: ["radius", "radius", "radius"],
    getRawExtents: (g) => [g.radius * 0.93417, g.radius * 0.93417, g.radius * 0.93417],
    handleFamily: "sphereLike",
  },
  octahedron: {
    axisParams: ["radius", "radius", "radius"],
    getRawExtents: sphereLikeExtents,
    handleFamily: "sphereLike",
  },
  icosahedron: {
    axisParams: ["radius", "radius", "radius"],
    getRawExtents: (g) => [g.radius * 0.85065, g.radius * 0.85065, g.radius * 0.85065],
    handleFamily: "sphereLike",
  },
  ellipsoid: {
    axisParams: ["radiusX", "radiusY", "radiusZ"],
    getRawExtents: (g) => [g.radiusX, g.radiusY, g.radiusZ],
    handleFamily: "ellipsoidLike",
  },
  triangularPrism: {
    axisParams: ["radius", "height", "radius"],
    getRawExtents: prismLikeExtents,
    handleFamily: "prismLike",
  },
  hexagonalPrism: {
    axisParams: ["radius", "height", "radius"],
    getRawExtents: prismLikeExtents,
    handleFamily: "prismLike",
  },
  pentagonalPrism: {
    axisParams: ["radius", "height", "radius"],
    getRawExtents: prismLikeExtents,
    handleFamily: "prismLike",
  },
  pentagonalPyramid: {
    axisParams: ["radius", "height", "radius"],
    getRawExtents: radialHeightExtents,
    handleFamily: "radialHeight",
  },
  squarePyramid: {
    axisParams: ["radius", "height", "radius"],
    getRawExtents: radialHeightExtents,
    handleFamily: "radialHeight",
  },
  ring: {
    axisParams: ["outerRadius", "height", "outerRadius"],
    getRawExtents: (g) => [g.outerRadius, g.outerRadius, g.height / 2],
    handleFamily: "ringLike",
  },
  paraboloid: {
    axisParams: ["radius", "height", "radius"],
    getRawExtents: radialHeightExtents,
    handleFamily: "radialHeight",
  },
  // Text uses TextBehavior for handles/bounds; registry used only for resolveScaleParams.
  text: {
    axisParams: ["size", "size", "height"],
  },
};

export function getDefaultShapeConfig(type) {
  return DEFAULT_SHAPE_TYPES[type] ?? null;
}

export { DEFAULT_SHAPE_TYPES };
