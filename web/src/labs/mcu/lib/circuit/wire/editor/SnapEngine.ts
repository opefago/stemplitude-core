/**
 * Snap candidate resolution with hysteresis to reduce snap fighting.
 */

import type { SnapCandidate, HoverTarget } from "./SchematicWireTypes";

export type SnapEngineConfig = {
  hysteresis: number;
  /** ms to prefer keeping current target after change */
  lockMs: number;
};

const DEFAULT_CFG: SnapEngineConfig = { hysteresis: 1.15, lockMs: 120 };

export class SnapEngine {
  private cfg: SnapEngineConfig;
  private current: SnapCandidate | null = null;
  private lockUntil = 0;

  constructor(cfg?: Partial<SnapEngineConfig>) {
    this.cfg = { ...DEFAULT_CFG, ...cfg };
  }

  reset(): void {
    this.current = null;
    this.lockUntil = 0;
  }

  /** Sort by priority then distance; apply hysteresis to current target. */
  resolve(candidates: SnapCandidate[], now = performance.now()): SnapCandidate | null {
    if (candidates.length === 0) {
      this.current = null;
      return null;
    }
    const sorted = [...candidates].sort(
      (a, b) => a.priority - b.priority || a.distPx - b.distPx,
    );
    const best = sorted[0]!;

    if (!this.current) {
      this.current = best;
      this.lockUntil = now + this.cfg.lockMs;
      return best;
    }

    if (now < this.lockUntil) {
      const stillOk = candidates.some((c) => targetKey(c.target) === targetKey(this.current!.target));
      if (stillOk) return this.current;
    }

    if (targetKey(best.target) === targetKey(this.current.target)) {
      return this.current;
    }

    if (best.distPx * this.cfg.hysteresis <= this.current.distPx + 1e-6 &&
       best.priority >= this.current.priority) {
      return this.current;
    }

    this.current = best;
    this.lockUntil = now + this.cfg.lockMs;
    return best;
  }
}

function targetKey(t: HoverTarget): string {
  switch (t.kind) {
    case "pin":
      return `p:${t.pinId}`;
    case "junction":
      return `j:${t.junctionId}`;
    case "segment":
      return `s:${t.wireId}:${t.segmentId}`;
    case "corner":
      return `c:${t.wireId}:${t.vertexIndex}`;
    default:
      return `e:${Math.round(t.world.x)}:${Math.round(t.world.y)}`;
  }
}
