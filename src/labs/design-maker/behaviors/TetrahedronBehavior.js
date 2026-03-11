import DefaultShapeBehavior from "./DefaultShapeBehavior";
import * as THREE from "three";

export default class TetrahedronBehavior extends DefaultShapeBehavior {
  getScaleHandles(obj, objectDims = null) {
    const g = obj.geometry;
    const o = this.handleOffset;
    const wb = this.getWorldBounds(
      obj.type,
      obj.geometry,
      obj.rotation || [0, 0, 0],
      obj.scale || [1, 1, 1],
      [0, 0, 0],
    );
    const minX = wb.min[0];
    const minY = wb.min[1];
    const minZ = wb.min[2];
    const maxX = wb.max[0];
    const maxY = wb.max[1];
    const maxZ = wb.max[2];
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    let apexX = cx;
    let apexY = maxY;
    let apexZ = cz;

    const verts = this.getExactVertices(obj.type, obj.geometry) || [];
    if (verts.length > 0) {
      const sx = Math.abs(obj.scale?.[0] ?? 1);
      const sy = Math.abs(obj.scale?.[1] ?? 1);
      const sz = Math.abs(obj.scale?.[2] ?? 1);
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          obj.rotation?.[0] || 0,
          obj.rotation?.[1] || 0,
          obj.rotation?.[2] || 0,
          "XYZ",
        ),
      );
      const v = new THREE.Vector3();
      let bestY = -Infinity;
      for (const [x, y, z] of verts) {
        v.set(x * sx, y * sy, z * sz).applyQuaternion(q);
        if (v.y > bestY) {
          bestY = v.y;
          apexX = v.x;
          apexY = v.y;
          apexZ = v.z;
        }
      }
    }

    return [
      { param: "radius", dir: [1, 0, 0], pos: [maxX + o, minY, cz], label: "R" },
      { param: "radius", dir: [-1, 0, 0], pos: [minX - o, minY, cz], label: "R" },
      { param: "radius", dir: [0, 0, 1], pos: [cx, minY, maxZ + o], label: "R" },
      // Keep top scale handle centered on the true apex for rotated tetrahedra.
      { param: "radius", dir: [0, 1, 0], pos: [apexX, apexY + 0.5, apexZ], label: "R" },
    ];
  }
}
