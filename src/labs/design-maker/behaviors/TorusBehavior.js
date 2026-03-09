import DefaultShapeBehavior from "./DefaultShapeBehavior";

export default class TorusBehavior extends DefaultShapeBehavior {
  getScaleHandles(obj, objectDims = null) {
    const g = obj.geometry;
    const o = this.handleOffset;
    // objectDims is world-space (from getObjectWorldDims), so for a flat torus:
    //   hw = hd = radius+tube (outer rim in XZ),  hh = tube (height in world Y)
    const hw = (objectDims?.width  ?? (g.radius + g.tube) * 2) / 2;
    const hh = (objectDims?.height ?? g.tube * 2)             / 2;
    const hd = (objectDims?.depth  ?? (g.radius + g.tube) * 2) / 2;

    return [
      { param: "radius", dir: [1,  0, 0], pos: [hw + o, -hh, 0],  label: "R" },
      { param: "radius", dir: [-1, 0, 0], pos: [-hw - o, -hh, 0], label: "R" },
      { param: "radius", dir: [0,  0, 1], pos: [0, -hh, hd + o],  label: "R" },
      { param: "radius", dir: [0,  0,-1], pos: [0, -hh, -hd - o], label: "R" },
      { param: "tube",   dir: [0,  1, 0], pos: [0, hh + o, 0],    label: "T" },
      { param: "tube",   dir: [0, -1, 0], pos: [0, -hh - o, 0],   label: "T" },
    ];
  }
}
