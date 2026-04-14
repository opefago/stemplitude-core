import { describe, expect, it } from "vitest";
import {
  createInitialDebugSession,
  nextDebugSession,
  resolveDebugActionLabel,
  resolveDebugSourceMode,
} from "../../../src/features/robotics_lab/debugSession";

describe("debugSession helpers", () => {
  it("resolves source mode for blocks/python/cpp", () => {
    expect(resolveDebugSourceMode("blocks")).toBe("blocks");
    expect(resolveDebugSourceMode("hybrid")).toBe("blocks");
    expect(resolveDebugSourceMode("python")).toBe("python");
    expect(resolveDebugSourceMode("cpp")).toBe("cpp");
  });

  it("resolves action labels by policy", () => {
    expect(resolveDebugActionLabel("semantic_next")).toBe("step");
    expect(resolveDebugActionLabel("step_into")).toBe("step_into");
    expect(resolveDebugActionLabel("step_over")).toBe("step_over");
    expect(resolveDebugActionLabel("semantic_next", "run")).toBe("run");
  });

  it("records trace entries and caps the trace length", () => {
    let session = createInitialDebugSession("blocks");
    for (let i = 0; i < 20; i += 1) {
      session = nextDebugSession(session, {
        mode: "blocks",
        action: "step",
        result: {
          state: "running",
          highlightedNodeId: `node_${i}`,
          issues: [],
          semanticEvent: {
            type: "node_executed",
            nodeId: `node_${i}`,
            callDepth: 0,
          },
        },
      });
    }
    expect(session.trace).toHaveLength(12);
    expect(session.trace[0].nodeId).toBe("node_19");
    expect(session.trace[0].locationLabel).toBe("Step node_19");
  });

  it("adds text line hint for interpreter-generated node ids", () => {
    const initial = createInitialDebugSession("python");
    const updated = nextDebugSession(initial, {
      mode: "python",
      action: "step",
      result: {
        state: "running",
        highlightedNodeId: "txt_3",
        issues: [],
        semanticEvent: {
          type: "node_executed",
          nodeId: "txt_3",
          callDepth: 0,
        },
      },
    });
    expect(updated.lineHint).toBe("Line 4");
    expect(updated.locationLabel).toBe("Line 4");
  });

  it("prefers mapped human-readable node labels", () => {
    const initial = createInitialDebugSession("blocks");
    const labels = new Map([["weird_block_id", "forward 200 mm"]]);
    const sequence = [
      { id: "before_id", label: "turn left 90 deg" },
      { id: "weird_block_id", label: "forward 200 mm" },
      { id: "after_id", label: "wait 1s" },
    ];
    const updated = nextDebugSession(initial, {
      mode: "blocks",
      action: "step",
      nodeLabels: labels,
      nodeSequence: sequence,
      result: {
        state: "running",
        highlightedNodeId: "weird_block_id__q1_call",
        issues: [],
        semanticEvent: {
          type: "action_progress",
          nodeId: "weird_block_id__q1_call",
          callDepth: 0,
        },
      },
    });
    expect(updated.locationLabel).toBe("forward 200 mm");
    expect(updated.trace[0].locationLabel).toBe("forward 200 mm");
    expect(updated.blockWindow).toEqual({
      previous: { id: "before_id", kind: "node", label: "turn left 90 deg" },
      current: { id: "weird_block_id", kind: "node", label: "forward 200 mm" },
      next: { id: "after_id", kind: "node", label: "wait 1s" },
    });
  });
});

