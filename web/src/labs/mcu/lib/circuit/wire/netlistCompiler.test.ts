import { describe, expect, it } from "vitest";
import { compileInteractiveWireNetGraph } from "./netlistCompiler";

type WireNode = {
  id: string;
  type: "component" | "junction";
  componentId?: string;
  nodeId?: string;
  x?: number;
  y?: number;
};

const comp = (
  id: string,
  componentId: string,
  nodeId: string,
  x: number,
  y: number,
): WireNode => ({ id, type: "component", componentId, nodeId, x, y });

const junc = (id: string, x: number, y: number): WireNode => ({
  id,
  type: "junction",
  x,
  y,
});

function isConnected(edges: ReadonlyArray<readonly [string, string]>, a: string, b: string): boolean {
  const graph = new Map<string, Set<string>>();
  const add = (u: string, v: string) => {
    let s = graph.get(u);
    if (!s) {
      s = new Set();
      graph.set(u, s);
    }
    s.add(v);
  };
  for (const [u, v] of edges) {
    add(u, v);
    add(v, u);
  }
  const q = [a];
  const seen = new Set<string>(q);
  while (q.length > 0) {
    const u = q.shift()!;
    if (u === b) return true;
    for (const v of graph.get(u) ?? []) {
      if (!seen.has(v)) {
        seen.add(v);
        q.push(v);
      }
    }
  }
  return false;
}

describe("compileInteractiveWireNetGraph", () => {
  it("merges junction ids sharing a snapped grid point", () => {
    const wires = new Map([
      ["w1", { nodes: [comp("a", "BAT", "positive", 0, 0), junc("ja", 100, 0)] }],
      ["w2", { nodes: [junc("jb", 102, 0), comp("b", "R1", "terminal1", 200, 0)] }],
    ]);
    const { edges } = compileInteractiveWireNetGraph(wires, { gridPitchPx: 10 });
    expect(isConnected(edges, "BAT_positive", "R1_terminal1")).toBe(true);
  });

  it("connects branch resistor terminals together when branch is explicitly shorted", () => {
    const jTop = junc("jTop", 80, 0);
    const jBot = junc("jBot", 80, 40);
    const wires = new Map([
      ["w1", { nodes: [comp("a", "R2", "terminal1", 110, 0), jTop] }],
      ["w2", { nodes: [comp("b", "R2", "terminal2", 110, 40), jBot] }],
      ["w3", { nodes: [jTop, jBot] }],
    ]);
    const { edges } = compileInteractiveWireNetGraph(wires, { gridPitchPx: 10 });
    expect(isConnected(edges, "R2_terminal1", "R2_terminal2")).toBe(true);
  });
});
