import DefaultShapeBehavior from "./DefaultShapeBehavior";

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

    return [
      { param: "radius", dir: [1, 0, 0], pos: [maxX + o, minY, cz], label: "R" },
      { param: "radius", dir: [-1, 0, 0], pos: [minX - o, minY, cz], label: "R" },
      { param: "radius", dir: [0, 0, 1], pos: [cx, minY, maxZ + o], label: "R" },
      { param: "radius", dir: [0, 1, 0], pos: [cx, maxY + 4, cz], label: "R" },
    ];
  }
}
