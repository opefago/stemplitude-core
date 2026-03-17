import * as THREE from "three";
import BaseObjectBehavior from "./BaseObjectBehavior";
import { getDefaultShapeConfig } from "./defaultShapeTypes";
import { getHandleFamily } from "./handleFamilies";

const POLYHEDRON_VERTEX_CACHE = new Map();

function getPolyhedronVertices(type, radius) {
  const key = `${type}:${radius}`;
  if (POLYHEDRON_VERTEX_CACHE.has(key))
    return POLYHEDRON_VERTEX_CACHE.get(key);
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

export default class DefaultShapeBehavior extends BaseObjectBehavior {
  getRawExtents(type, geometry) {
    const config = getDefaultShapeConfig(type);
    if (config?.getRawExtents) return config.getRawExtents(geometry);
    return [10, 10, 10];
  }

  getLocalBounds(type, geometry) {
    const [hx, hy, hz] = this.getRawExtents(type, geometry);
    return {
      min: [-hx, -hy, -hz],
      max: [hx, hy, hz],
    };
  }

  getExactVertices(type, geometry) {
    if (
      type === "tetrahedron" ||
      type === "dodecahedron" ||
      type === "octahedron" ||
      type === "icosahedron"
    ) {
      return getPolyhedronVertices(type, geometry.radius || 10);
    }
    return null;
  }

  getScaleHandles(obj, objectDims = null) {
    const config = getDefaultShapeConfig(obj.type);
    if (!config) return [];
    const family = getHandleFamily(config.handleFamily);
    if (!family) return [];
    const g = obj.geometry;
    const o = this.handleOffset;
    const opts = config.handleOptions || {};
    return family.buildHandles(g, o, opts);
  }

  resolveScaleParams(targetObj, handle, axis) {
    const config = getDefaultShapeConfig(targetObj.type);
    if (!config?.axisParams) return { param: handle.param, linkedParam: handle.linkedParam };
    const param = config.axisParams[axis] ?? handle.param;
    const linkedParam =
      (config.linkedParams && config.linkedParams[axis]) ?? handle.linkedParam;
    return { param, linkedParam };
  }
}
