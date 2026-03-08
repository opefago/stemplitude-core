/**
 * Full OOP handle families: one class per scale-handle pattern, each owning its logic.
 * Strategy pattern + registry (family name → instance). Add a new subclass and register it
 * to support a new handle layout.
 *
 */

/**
 * Base for all handle families. Subclasses implement buildHandles(g, o, opts).
 * @param {Object} g - geometry descriptor (width, height, radius, etc.)
 * @param {number} o - handle offset from surface
 * @param {Object} [opts] - optional overrides (e.g. hemisphere baseY/topY)
 * @returns {Array<{ param?: string, linkedParam?: string, scaleAxis?: number, dir: number[], pos: number[], label: string }>}
 */
export class HandleFamily {
  buildHandles(_g, _o, _opts) {
    return [];
  }
}

export class BoxLikeHandleFamily extends HandleFamily {
  buildHandles(g, o) {
    const by = -g.height / 2;
    return [
      {
        param: "width",
        dir: [1, 0, 0],
        pos: [g.width / 2 + o, by, 0],
        label: "W",
      },
      {
        param: "width",
        dir: [-1, 0, 0],
        pos: [-g.width / 2 - o, by, 0],
        label: "W",
      },
      {
        param: "depth",
        dir: [0, 0, 1],
        pos: [0, by, g.depth / 2 + o],
        label: "D",
      },
      {
        param: "depth",
        dir: [0, 0, -1],
        pos: [0, by, -g.depth / 2 - o],
        label: "D",
      },
      {
        param: "height",
        dir: [0, 1, 0],
        pos: [0, g.height / 2 + o, 0],
        label: "H",
      },
    ];
  }
}

export class SphereLikeHandleFamily extends HandleFamily {
  buildHandles(g, o, opts) {
    const param = opts?.param ?? "radius";
    let baseY = -g.radius;
    const minFloat = Math.max(o, 12);
    let topY = g.radius + minFloat;
    if (opts?.baseY != null && opts?.topY != null) {
      baseY = typeof opts.baseY === "function" ? opts.baseY(g) : opts.baseY;
      topY = typeof opts.topY === "function" ? opts.topY(g, o) : opts.topY;
    }
    return [
      { param, dir: [1, 0, 0], pos: [g.radius + o, baseY, 0], label: "R" },
      { param, dir: [-1, 0, 0], pos: [-g.radius - o, baseY, 0], label: "R" },
      { param, dir: [0, 0, 1], pos: [0, baseY, g.radius + o], label: "R" },
      { param, dir: [0, 1, 0], pos: [0, topY, 0], label: "R" },
    ];
  }
}

export class CylinderLikeHandleFamily extends HandleFamily {
  buildHandles(g, o) {
    const by = -g.height / 2;
    const handles = [
      {
        param: "radiusBottom",
        linkedParam: "radiusTop",
        dir: [1, 0, 0],
        pos: [g.radiusBottom + o, by, 0],
        label: "R",
      },
      {
        param: "radiusBottom",
        linkedParam: "radiusTop",
        dir: [-1, 0, 0],
        pos: [-g.radiusBottom - o, by, 0],
        label: "R",
      },
    ];
    if (Math.abs((g.radiusTop ?? 0) - (g.radiusBottom ?? 0)) > 0.001) {
      handles.push({
        param: "radiusTop",
        dir: [1, 0, 0],
        pos: [g.radiusTop + o, g.height / 2, 0],
        label: "Rt",
      });
    }
    handles.push({
      param: "height",
      dir: [0, 1, 0],
      pos: [0, g.height / 2 + o, 0],
      label: "H",
    });
    return handles;
  }
}

export class RadialHeightHandleFamily extends HandleFamily {
  buildHandles(g, o) {
    const by = -g.height / 2;
    return [
      {
        param: "radius",
        dir: [1, 0, 0],
        pos: [g.radius + o, by, 0],
        label: "R",
      },
      {
        param: "radius",
        dir: [-1, 0, 0],
        pos: [-g.radius - o, by, 0],
        label: "R",
      },
      {
        param: "height",
        dir: [0, 1, 0],
        pos: [0, g.height / 2 + o, 0],
        label: "H",
      },
    ];
  }
}

export class PrismLikeHandleFamily extends HandleFamily {
  buildHandles(g, o) {
    const by = -g.height / 2;
    return [
      {
        param: "radius",
        dir: [1, 0, 0],
        pos: [g.radius + o, by, 0],
        label: "R",
      },
      {
        param: "radius",
        dir: [-1, 0, 0],
        pos: [-g.radius - o, by, 0],
        label: "R",
      },
      {
        param: "radius",
        dir: [0, 0, 1],
        pos: [0, by, g.radius + o],
        label: "R",
      },
      {
        param: "height",
        dir: [0, 1, 0],
        pos: [0, g.height / 2 + o, 0],
        label: "H",
      },
    ];
  }
}

export class EllipsoidLikeHandleFamily extends HandleFamily {
  buildHandles(g, o) {
    const by = -g.radiusY;
    return [
      {
        param: "radiusX",
        dir: [1, 0, 0],
        pos: [g.radiusX + o, by, 0],
        label: "Rx",
      },
      {
        param: "radiusX",
        dir: [-1, 0, 0],
        pos: [-g.radiusX - o, by, 0],
        label: "Rx",
      },
      {
        param: "radiusZ",
        dir: [0, 0, 1],
        pos: [0, by, g.radiusZ + o],
        label: "Rz",
      },
      {
        param: "radiusZ",
        dir: [0, 0, -1],
        pos: [0, by, -g.radiusZ - o],
        label: "Rz",
      },
      {
        param: "radiusY",
        dir: [0, 1, 0],
        pos: [0, g.radiusY + o, 0],
        label: "Ry",
      },
    ];
  }
}

export class RingLikeHandleFamily extends HandleFamily {
  buildHandles(g, o) {
    const by = -g.height / 2;
    return [
      {
        param: "outerRadius",
        dir: [1, 0, 0],
        pos: [g.outerRadius + o, by, 0],
        label: "R",
      },
      {
        param: "outerRadius",
        dir: [0, 0, 1],
        pos: [0, by, g.outerRadius + o],
        label: "R",
      },
      {
        param: "innerRadius",
        dir: [-1, 0, 0],
        pos: [-g.innerRadius - o, by, 0],
        label: "Ri",
      },
      {
        param: "height",
        dir: [0, 1, 0],
        pos: [0, g.height / 2 + o, 0],
        label: "H",
      },
    ];
  }
}

export class HeartLikeHandleFamily extends HandleFamily {
  buildHandles(g, o) {
    return [
      {
        param: "size",
        dir: [1, 0, 0],
        pos: [g.size + o, -g.depth / 2, 0],
        label: "S",
      },
      {
        param: "depth",
        dir: [0, 1, 0],
        pos: [0, g.depth / 2 + o, 0],
        label: "D",
      },
    ];
  }
}

export class StarLikeHandleFamily extends HandleFamily {
  buildHandles(g, o) {
    const by = -g.depth / 2;
    return [
      {
        param: "outerRadius",
        dir: [1, 0, 0],
        pos: [g.outerRadius + o, by, 0],
        label: "R",
      },
      {
        param: "outerRadius",
        dir: [0, 0, 1],
        pos: [0, by, g.outerRadius + o],
        label: "R",
      },
      {
        param: "depth",
        dir: [0, 1, 0],
        pos: [0, g.depth / 2 + o, 0],
        label: "D",
      },
    ];
  }
}

const HANDLE_FAMILY_REGISTRY = {
  boxLike: new BoxLikeHandleFamily(),
  sphereLike: new SphereLikeHandleFamily(),
  cylinderLike: new CylinderLikeHandleFamily(),
  radialHeight: new RadialHeightHandleFamily(),
  prismLike: new PrismLikeHandleFamily(),
  ellipsoidLike: new EllipsoidLikeHandleFamily(),
  ringLike: new RingLikeHandleFamily(),
  heartLike: new HeartLikeHandleFamily(),
  starLike: new StarLikeHandleFamily(),
};

export function getHandleFamily(name) {
  return HANDLE_FAMILY_REGISTRY[name] ?? null;
}
