/**
 * Read-only view of editor topology for queries (junctions, explicit connectivity).
 * Electrical nets stay in the solver — this mirrors WireNode graph only.
 */

import type { WireNode, InteractiveWireConnection } from "../../InteractiveWireSystem";
import type { JunctionId, SchematicJunction } from "./SchematicWireTypes";

export class WireGraph {
  /** Junctions keyed by editor node id */
  getJunctionsFromWires(
    wires: Map<string, InteractiveWireConnection>,
  ): Map<JunctionId, SchematicJunction> {
    const map = new Map<JunctionId, SchematicJunction>();
    for (const wire of wires.values()) {
      for (const n of wire.nodes) {
        if (n.type !== "junction") continue;
        const existing = map.get(n.id);
        const wids = new Set(existing?.incidentWireIds ?? []);
        wids.add(wire.id);
        map.set(n.id, { id: n.id, world: { x: n.x, y: n.y }, incidentWireIds: [...wids] });
      }
    }
    return map;
  }

  collectWireNodes(wires: Map<string, InteractiveWireConnection>): WireNode[] {
    const byId = new Map<string, WireNode>();
    for (const w of wires.values()) {
      for (const n of w.nodes) {
        byId.set(n.id, n);
      }
    }
    return [...byId.values()];
  }
}
