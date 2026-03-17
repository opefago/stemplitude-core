import { createGeometry } from "../geometryFactory";
import DefaultShapeBehavior from "./DefaultShapeBehavior";

const textBoundsCache = new Map();

export default class TextBehavior extends DefaultShapeBehavior {
  getLocalBounds(_type, geometry) {
    const text = geometry?.text || "Text";
    const size = geometry?.size || 10;
    const height = geometry?.height || 5;
    const font = geometry?.font || "helvetiker";
    const cacheKey = `${text}|${size}|${height}|${font}`;
    const cached = textBoundsCache.get(cacheKey);
    if (cached) return cached;

    try {
      const textGeo = createGeometry("text", geometry || {});
      if (!textGeo.boundingBox) textGeo.computeBoundingBox();
      const bb = textGeo.boundingBox;
      const bounds = bb
        ? {
            min: [bb.min.x, bb.min.y, bb.min.z],
            max: [bb.max.x, bb.max.y, bb.max.z],
          }
        : { min: [-10, -5, -2.5], max: [10, 5, 2.5] };
      textGeo.dispose();
      textBoundsCache.set(cacheKey, bounds);
      return bounds;
    } catch {
      return {
        min: [
          -Math.max(size / 2, text.length * size * 0.3),
          -size / 2,
          -(height + 0.6) / 2,
        ],
        max: [
          Math.max(size / 2, text.length * size * 0.3),
          size / 2,
          (height + 0.6) / 2,
        ],
      };
    }
  }

  getDimensions(obj) {
    const g = obj.geometry;
    const s = obj.scale || [1, 1, 1];
    const w = Math.max(
      g.size || 10,
      (g.text || "Text").length * (g.size || 10) * 0.6,
    );
    const h = g.size || 10;
    const d = (g.height || 5) + 0.6;
    return {
      width: Math.abs(w * s[0]),
      height: Math.abs(h * s[1]),
      depth: Math.abs(d * s[2]),
    };
  }

  getScaleHandles(obj, objectDims = null) {
    const g = obj.geometry;
    const o = this.handleOffset;
    const text = g.text || "Text";
    const size = g.size || 10;
    const width = objectDims?.width ?? Math.max(size * 2, text.length * size * 0.6);
    const height = objectDims?.height ?? size;
    const depth = objectDims?.depth ?? (g.height || 5) + 0.6;
    const by = -height / 2;
    const zHandleDist = Math.max(depth / 2 + o, 6);

    return [
      { scaleAxis: 0, dir: [1, 0, 0], pos: [width / 2 + o, by, 0], label: "W" },
      { scaleAxis: 0, dir: [-1, 0, 0], pos: [-width / 2 - o, by, 0], label: "W" },
      { scaleAxis: 2, dir: [0, 0, 1], pos: [0, by, zHandleDist], label: "D" },
      { scaleAxis: 2, dir: [0, 0, -1], pos: [0, by, -zHandleDist], label: "D" },
      { scaleAxis: 1, dir: [0, 1, 0], pos: [0, height / 2 + o, 0], label: "H" },
    ];
  }
}
