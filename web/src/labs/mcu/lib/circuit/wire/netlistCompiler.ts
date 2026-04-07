export interface NetlistCompilerWireNode {
  type: string;
  id: string;
  componentId?: string;
  nodeId?: string;
  x?: number;
  y?: number;
}

export interface NetlistCompilerWire {
  nodes: NetlistCompilerWireNode[];
}

export type NetGraphEdge = readonly [string, string];

export interface CompiledNetGraph {
  edges: NetGraphEdge[];
  junctionVertexPrefix: string;
}

const JUNCTION_VERTEX_PREFIX = "\0schem:jnet\0";

/**
 * Compile editor wire topology into a deterministic electrical graph.
 *
 * This is Phase 1 of a SPICE-like pipeline:
 * - extract ideal connectivity (graph/netlist) from geometry + wire nodes,
 * - keep solver/MNA separate from UI routing details.
 */
export function compileInteractiveWireNetGraph(
  wires: Map<string, NetlistCompilerWire>,
  options?: { gridPitchPx?: number },
): CompiledNetGraph {
  const gridPitch = options?.gridPitchPx ?? 10;
  const parent = new Map<string, string>();

  const find = (id: string): string => {
    const p = parent.get(id);
    if (p === undefined) {
      parent.set(id, id);
      return id;
    }
    if (p !== id) {
      const r = find(p);
      parent.set(id, r);
      return r;
    }
    return id;
  };

  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const electricalSeq = (nodes: NetlistCompilerWireNode[]) =>
    nodes.filter((n) => n.type === "component" || n.type === "junction");

  for (const wire of wires.values()) {
    for (const n of wire.nodes) {
      if (n.type === "junction") find(n.id);
    }
  }

  // Merge junctions occupying same snapped grid location.
  const cellBuckets = new Map<string, string[]>();
  for (const wire of wires.values()) {
    for (const n of wire.nodes) {
      if (n.type !== "junction") continue;
      if (
        typeof n.x !== "number" ||
        typeof n.y !== "number" ||
        !Number.isFinite(n.x) ||
        !Number.isFinite(n.y)
      ) {
        continue;
      }
      const ix = Math.round(n.x / gridPitch);
      const iy = Math.round(n.y / gridPitch);
      const key = `${ix},${iy}`;
      let bucket = cellBuckets.get(key);
      if (!bucket) {
        bucket = [];
        cellBuckets.set(key, bucket);
      }
      if (!bucket.includes(n.id)) bucket.push(n.id);
    }
  }
  for (const ids of cellBuckets.values()) {
    if (ids.length < 2) continue;
    const head = ids[0]!;
    for (let i = 1; i < ids.length; i++) union(head, ids[i]!);
  }

  // Merge contiguous junction runs found within ordered wire node sequences.
  for (const wire of wires.values()) {
    const seq = electricalSeq(wire.nodes);
    for (let i = 0; i < seq.length - 1; i++) {
      const a = seq[i]!;
      const b = seq[i + 1]!;
      if (a.type === "junction" && b.type === "junction") union(a.id, b.id);
    }
  }

  const toVertex = (n: NetlistCompilerWireNode): string | undefined => {
    if (n.type === "junction") return `${JUNCTION_VERTEX_PREFIX}${find(n.id)}`;
    if (n.type === "component" && n.componentId && n.nodeId) {
      return `${n.componentId}_${n.nodeId}`;
    }
    return undefined;
  };

  // Deduplicate as undirected edges.
  const edgeMap = new Map<string, NetGraphEdge>();
  for (const wire of wires.values()) {
    const seq = electricalSeq(wire.nodes);
    for (let i = 0; i < seq.length - 1; i++) {
      const va = toVertex(seq[i]!);
      const vb = toVertex(seq[i + 1]!);
      if (!va || !vb || va === vb) continue;
      const key = va < vb ? `${va}\t${vb}` : `${vb}\t${va}`;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, va < vb ? [va, vb] : [vb, va]);
      }
    }
  }

  return {
    edges: Array.from(edgeMap.values()),
    junctionVertexPrefix: JUNCTION_VERTEX_PREFIX,
  };
}
