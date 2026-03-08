import DefaultShapeBehavior from "./DefaultShapeBehavior";

export default class TorusBehavior extends DefaultShapeBehavior {
  getScaleHandles(obj, objectDims = null) {
    const g = obj.geometry;
    const o = this.handleOffset;
    const outerX = (objectDims?.width ?? (g.radius + g.tube) * 2) / 2;
    const outerY = (objectDims?.height ?? (g.radius + g.tube) * 2) / 2;
    const outerZ = (objectDims?.depth ?? g.tube * 2) / 2;
    const by = -outerY;

    return [
      { param: "radius", dir: [1, 0, 0], pos: [outerX + o, by, 0], label: "R" },
      { param: "radius", dir: [-1, 0, 0], pos: [-outerX - o, by, 0], label: "R" },
      { param: "radius", dir: [0, 1, 0], pos: [0, outerY + o, 0], label: "R" },
      { param: "radius", dir: [0, -1, 0], pos: [0, -outerY - o, 0], label: "R" },
      { param: "tube", dir: [0, 0, 1], pos: [0, by, outerZ + o], label: "T" },
      { param: "tube", dir: [0, 0, -1], pos: [0, by, -outerZ - o], label: "T" },
    ];
  }
}
