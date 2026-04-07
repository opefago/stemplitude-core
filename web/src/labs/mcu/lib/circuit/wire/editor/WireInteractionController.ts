/**
 * Wire editing FSM — state + session snapshots (commits stay in InteractiveWireSystem).
 */

import type { WireInteractionStateName, WireEditSession } from "./SchematicWireTypes";

export class WireInteractionController {
  state: WireInteractionStateName = "idle";
  session: WireEditSession | null = null;

  transition(next: WireInteractionStateName): void {
    this.state = next;
    if (next === "idle") {
      this.session = null;
    }
  }

  beginSession(state: WireInteractionStateName): WireEditSession {
    this.state = state;
    this.session = {
      sessionId: `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      state,
      undoSnapshots: [],
    };
    return this.session;
  }

  pushUndo(snapshot: unknown): void {
    this.session?.undoSnapshots.push(snapshot);
  }

  cancel(): void {
    this.state = "idle";
    this.session = null;
  }
}
