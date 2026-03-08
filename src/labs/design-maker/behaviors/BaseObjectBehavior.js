import * as THREE from "three";

export default class BaseObjectBehavior {
  constructor({ handleOffset = 3, translateArrowGap = 10 } = {}) {
    this.handleOffset = handleOffset;
    this.translateArrowGap = translateArrowGap;
  }

  getScaleHandles(_obj, _objectDims = null) {
    return [];
  }

  // --- Dimensions and bounds (override in subclasses for type-specific logic) ---

  /**
   * Local axis-aligned bounds before scale/rotation. Used for floor alignment and world bounds.
   * @returns {{ min: [number, number, number], max: [number, number, number] }}
   */
  getLocalBounds(_type, _geometry) {
    return { min: [-10, -10, -10], max: [10, 10, 10] };
  }

  /**
   * Optional exact vertices for rotated bounds (e.g. polyhedra). Return null to use bbox corners.
   * @returns {Array<[number, number, number]> | null}
   */
  getExactVertices(_type, _geometry) {
    return null;
  }

  /**
   * UI-facing dimensions (handles, ruler). Scale is applied.
   * Default: derived from getLocalBounds * scale.
   */
  getDimensions(obj) {
    const b = this.getLocalBounds(obj.type, obj.geometry);
    const s = obj.scale || [1, 1, 1];
    return {
      width: (b.max[0] - b.min[0]) * Math.abs(s[0]),
      height: (b.max[1] - b.min[1]) * Math.abs(s[1]),
      depth: (b.max[2] - b.min[2]) * Math.abs(s[2]),
    };
  }

  /**
   * Y offset so that the lowest point of the shape sits at y=0 after placement.
   */
  getFloorY(type, geometry, rotation, scale) {
    const localBounds = this.getLocalBounds(type, geometry);
    const exactVerts = this.getExactVertices(type, geometry);
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

    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation[0], rotation[1], rotation[2], "XYZ"),
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

  /**
   * World-space AABB after rotation, scale, and position.
   */
  getWorldBounds(type, geometry, rotation, scale, position) {
    const localBounds = this.getLocalBounds(type, geometry);
    const exactVerts = this.getExactVertices(type, geometry);
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
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const [x, y, z] of sourcePoints) {
      v.set(x, y, z).applyQuaternion(q);
      const wx = v.x + px, wy = v.y + py, wz = v.z + pz;
      if (wx < minX) minX = wx;
      if (wy < minY) minY = wy;
      if (wz < minZ) minZ = wz;
      if (wx > maxX) maxX = wx;
      if (wy > maxY) maxY = wy;
      if (wz > maxZ) maxZ = wz;
    }
    return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
  }

  getTranslateArrows({ hw, hh, hd }) {
    const arrowGap = this.translateArrowGap;
    return [
      {
        dir: [1, 0, 0],
        pos: [hw + arrowGap, 0, 0],
        rot: [0, 0, -Math.PI / 2],
        color: "#ef4444",
      },
      {
        dir: [-1, 0, 0],
        pos: [-hw - arrowGap, 0, 0],
        rot: [0, 0, Math.PI / 2],
        color: "#ef4444",
      },
      {
        dir: [0, 1, 0],
        pos: [0, hh + arrowGap, 0],
        rot: [0, 0, 0],
        color: "#22c55e",
      },
      {
        dir: [0, 0, 1],
        pos: [0, 0, hd + arrowGap],
        rot: [Math.PI / 2, 0, 0],
        color: "#3b82f6",
      },
      {
        dir: [0, 0, -1],
        pos: [0, 0, -hd - arrowGap],
        rot: [-Math.PI / 2, 0, 0],
        color: "#3b82f6",
      },
    ];
  }

  getRotationArcs({ hw, hh, hd }) {
    return [
      {
        axis: 0,
        pos: [-hw - 3, hh / 2, hd + 3],
        arcRot: [0, Math.PI / 2, 0],
        color: "#ef4444",
      },
      {
        axis: 1,
        pos: [hw + 3, -hh, 0],
        arcRot: [-Math.PI / 2, 0, 0],
        color: "#22c55e",
      },
      { axis: 2, pos: [hw + 3, 0, hd + 3], arcRot: [0, 0, 0], color: "#3b82f6" },
    ];
  }

  resolveScaleParams(_targetObj, handle, _axis) {
    return { param: handle.param, linkedParam: handle.linkedParam };
  }
}
