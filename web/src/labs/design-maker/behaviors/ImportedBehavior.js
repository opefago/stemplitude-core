import DefaultShapeBehavior from "./DefaultShapeBehavior";

export default class ImportedBehavior extends DefaultShapeBehavior {
  getLocalBounds(_type, geometry) {
    if (geometry?.bufferGeometry) {
      const bg = geometry.bufferGeometry;
      if (!bg.boundingBox) bg.computeBoundingBox();
      const bb = bg.boundingBox;
      return {
        min: [bb.min.x, bb.min.y, bb.min.z],
        max: [bb.max.x, bb.max.y, bb.max.z],
      };
    }
    return { min: [-10, -10, -10], max: [10, 10, 10] };
  }

  getScaleHandles(_obj, objectDims = null) {
    const o = this.handleOffset;
    const d = objectDims || { width: 20, height: 20, depth: 20 };
    const by = -d.height / 2;
    return [
      { scaleAxis: 0, dir: [1, 0, 0], pos: [d.width / 2 + o, by, 0], label: "W" },
      { scaleAxis: 0, dir: [-1, 0, 0], pos: [-d.width / 2 - o, by, 0], label: "W" },
      { scaleAxis: 2, dir: [0, 0, 1], pos: [0, by, d.depth / 2 + o], label: "D" },
      { scaleAxis: 2, dir: [0, 0, -1], pos: [0, by, -d.depth / 2 - o], label: "D" },
      { scaleAxis: 1, dir: [0, 1, 0], pos: [0, d.height / 2 + o, 0], label: "H" },
    ];
  }
}
