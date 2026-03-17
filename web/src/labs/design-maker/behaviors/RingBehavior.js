import DefaultShapeBehavior from "./DefaultShapeBehavior";

export default class RingBehavior extends DefaultShapeBehavior {
  getScaleHandles(obj, objectDims = null) {
    const g = obj.geometry;
    const o = this.handleOffset;
    const hw = (objectDims?.width  ?? g.outerRadius * 2) / 2;
    const hh = (objectDims?.height ?? g.height)         / 2;
    const hd = (objectDims?.depth  ?? g.outerRadius * 2) / 2;
    // innerR scaled by X scale so the handle tracks the actual world inner rim
    const scaleX = obj.scale?.[0] ?? 1;
    const innerR = (g.innerRadius ?? g.outerRadius * 0.5) * scaleX;

    return [
      { param: "outerRadius", dir: [1,  0, 0], pos: [hw + o,      -hh, 0],       label: "R"  },
      { param: "outerRadius", dir: [-1, 0, 0], pos: [-(hw + o),   -hh, 0],       label: "R"  },
      { param: "outerRadius", dir: [0,  0, 1], pos: [0,           -hh, hd + o],  label: "R"  },
      { param: "innerRadius", dir: [0, -1, 0], pos: [0, -(hh + o), 0],            label: "Ri" },
      { param: "height",      dir: [0,  1, 0], pos: [0,       hh + o,  0],       label: "H"  },
    ];
  }

  resolveScaleParams(_targetObj, handle, _axis) {
    // Use handle.param directly: outerRadius, innerRadius, and height are distinct
    // and the axis-based mapping would confuse innerRadius (X-) with outerRadius (X axis).
    return { param: handle.param, linkedParam: handle.linkedParam };
  }
}
