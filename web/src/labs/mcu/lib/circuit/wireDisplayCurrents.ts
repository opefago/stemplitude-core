/**
 * Display helpers for wire animation: topology signature and per-net current scale.
 *
 * Branch currents on ideal zero-ohm nets are not uniquely determined by a global
 * linear KCL least-squares solve — pinv on the drawable graph can split arbitrarily,
 * which looks wrong on batteries, ground rails, and T-junctions. Per-wire magnitude
 * and direction come from InteractiveWireIntegration (endpoint terminal currents).
 * This module only supplies merged-net |I| hints for phase sync and topology churn.
 */

import type { InteractiveWireConnection, WireNode } from "./InteractiveWireSystem";
import type { SimulationSnapshot } from "./types/SimulationSnapshot";

const TOL_EQ = 1e-9;

export type FlowDir = "startToEnd" | "endToStart" | "unknown";

export type WireDisplayOverride = {
  signedAmps: number;
  flowDirEndpoint: FlowDir;
};

export type WireDisplaySolveResult = {
  overrides: Map<string, WireDisplayOverride>;
  topologySignature: string;
  /** Max |terminal I| per merged solver node — for shared motion along a bus */
  netMaxAbsByMerged: Map<number, number>;
};

function vertexKey(n: WireNode): string | null {
  if (n.type === "component" && n.componentId && n.nodeId) {
    return `p:${n.componentId}:${n.nodeId}`;
  }
  if (n.type === "junction") {
    return `j:${n.id}`;
  }
  return null;
}

function importantNodeIndices(wire: InteractiveWireConnection): number[] {
  const idx: number[] = [];
  for (let i = 0; i < wire.nodes.length; i++) {
    const t = wire.nodes[i].type;
    if (t === "component" || t === "junction") idx.push(i);
  }
  return idx;
}

export type DisplayEdge = {
  id: string;
  wireId: string;
  segIndex: number;
  tail: string;
  head: string;
  tailIdx: number;
  headIdx: number;
};

export type DisplayGraphBuild = {
  edges: DisplayEdge[];
  vertices: string[];
  topologySignature: string;
};

/**
 * Build series edges along each wire between consecutive component/junction nodes.
 */
export function buildWireDisplayGraph(
  wires: Map<string, InteractiveWireConnection>,
): DisplayGraphBuild {
  const edges: DisplayEdge[] = [];
  const vertexSet = new Set<string>();
  const sigParts: string[] = [];

  for (const [wireId, wire] of wires) {
    const imp = importantNodeIndices(wire);
    sigParts.push(`${wireId}:${imp.map((i) => vertexKey(wire.nodes[i]) ?? "?").join(">")}`);
    for (let s = 0; s < imp.length - 1; s++) {
      const ia = imp[s];
      const ib = imp[s + 1];
      const ta = vertexKey(wire.nodes[ia]);
      const tb = vertexKey(wire.nodes[ib]);
      if (!ta || !tb) continue;
      if (ta === tb) continue;
      vertexSet.add(ta);
      vertexSet.add(tb);
      edges.push({
        id: `${wireId}#${s}`,
        wireId,
        segIndex: s,
        tail: ta,
        head: tb,
        tailIdx: ia,
        headIdx: ib,
      });
    }
  }

  const vertices = Array.from(vertexSet).sort();
  sigParts.sort();
  return {
    edges,
    vertices,
    topologySignature: sigParts.join("|"),
  };
}

/**
 * Topology + merged-net drive strength for animation. Does not override per-wire
 * current or flow direction (left to InteractiveWireIntegration).
 */
export function resolveInteractiveWireDisplayCurrents(
  wires: Map<string, InteractiveWireConnection>,
  snapshot: SimulationSnapshot,
  getMergedNodeIndex: (compId: string, nodeId: string) => number | undefined,
  _prevSignature?: string,
): WireDisplaySolveResult {
  const { topologySignature } = buildWireDisplayGraph(wires);
  const netMaxAbs = new Map<number, number>();
  const term = snapshot.componentTerminalCurrents ?? {};

  for (const [compId, nodes] of Object.entries(term)) {
    for (const [nodeId, val] of Object.entries(nodes)) {
      if (!Number.isFinite(val)) continue;
      const a = Math.abs(val as number);
      if (a <= TOL_EQ) continue;
      const m = getMergedNodeIndex(compId, nodeId);
      if (m === undefined) continue;
      netMaxAbs.set(m, Math.max(netMaxAbs.get(m) ?? 0, a));
    }
  }

  return {
    overrides: new Map(),
    topologySignature,
    netMaxAbsByMerged: netMaxAbs,
  };
}
