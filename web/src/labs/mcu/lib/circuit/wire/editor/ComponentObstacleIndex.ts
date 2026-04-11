/**
 * Build inflated axis-aligned obstacles from live components for routers.
 */

import type { CircuitComponent } from "../../CircuitComponent";
import type { RoutingObstacle, SchematicRect } from "./SchematicWireTypes";

export type ObstacleIndexOptions = {
  paddingPx: number;
};

const DEFAULT_PAD = 10;

function boundsOfComponent(c: CircuitComponent): SchematicRect | null {
  try {
    const b = c.getBounds?.();
    if (b && typeof b.x === "number") {
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    }
  } catch {
    /* ignore */
  }
  const p = c.getPosition();
  return { x: p.x - 40, y: p.y - 40, w: 80, h: 80 };
}

export function buildObstaclesFromComponents(
  components: Map<string, CircuitComponent>,
  excludeIds: Set<string>,
  opts?: Partial<ObstacleIndexOptions>,
): RoutingObstacle[] {
  const padding = opts?.paddingPx ?? DEFAULT_PAD;
  const out: RoutingObstacle[] = [];
  for (const [id, c] of components) {
    if (excludeIds.has(id)) continue;
    const rect = boundsOfComponent(c);
    if (!rect) continue;
    out.push({
      id,
      rect: {
        x: rect.x - padding,
        y: rect.y - padding,
        w: rect.w + 2 * padding,
        h: rect.h + 2 * padding,
      },
      padding,
    });
  }
  return out;
}
