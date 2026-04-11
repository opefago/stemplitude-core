/**
 * Stabilizes wire-flow animation: dead zone, EMA on |I|, Schmitt + hold on direction flips.
 * Works in canonical endpoint order (same signed convention as wire.current: + = start→end).
 */

export type WireAnimStabilizerConfig = {
  /** Below: treat as electrically idle for animation / direction updates */
  iDead: number;
  /** |display| must exceed this to start a direction flip */
  iFlipOn: number;
  /** Inner hysteresis band — release pending if |display| drops below */
  iFlipOff: number;
  tHoldDirMs: number;
  tMinFlipMs: number;
  betaDc: number;
  betaAc: number;
  fadeOutPerSec: number;
  fadeInPerSec: number;
};

export const DEFAULT_WIRE_ANIM_STABILIZER_CONFIG: WireAnimStabilizerConfig = {
  iDead: 5e-4,
  iFlipOn: 2e-3,
  iFlipOff: 1e-3,
  tHoldDirMs: 120,
  tMinFlipMs: 200,
  betaDc: 0.22,
  betaAc: 0.09,
  fadeOutPerSec: 5,
  fadeInPerSec: 7,
};

type WireAnimWireState = {
  displayCurrent: number;
  /** +1 = flow along polyline in startEp→endEp sense */
  visualSignAlongEndpoints: 1 | -1;
  pendingDir: 1 | -1 | null;
  pendingSinceMs: number | null;
  lastFlipAtMs: number;
  fade01: number;
};

export class WireAnimationStabilizer {
  private readonly cfg: WireAnimStabilizerConfig;
  private readonly byWire = new Map<string, WireAnimWireState>();

  constructor(cfg?: Partial<WireAnimStabilizerConfig>) {
    this.cfg = { ...DEFAULT_WIRE_ANIM_STABILIZER_CONFIG, ...cfg };
  }

  clear(): void {
    this.byWire.clear();
  }

  /** Drop state for removed wires */
  syncActiveWires(activeIds: Iterable<string>): void {
    const keep = new Set(activeIds);
    for (const k of this.byWire.keys()) {
      if (!keep.has(k)) this.byWire.delete(k);
    }
  }

  /**
   * @param solvedEndpointSigned — solver/UI wire.current (A), + = start→end
   * @param useAcBeta — slower EMA (transient / expected AC-like ripple)
   */
  step(
    wireId: string,
    solvedEndpointSigned: number,
    dtSec: number,
    nowMs: number,
    useAcBeta: boolean,
  ): void {
    let s = this.byWire.get(wireId);
    if (!s) {
      const sign0: 1 | -1 =
        Math.abs(solvedEndpointSigned) >= this.cfg.iDead
          ? solvedEndpointSigned > 0
            ? 1
            : -1
          : 1;
      s = {
        displayCurrent: solvedEndpointSigned,
        visualSignAlongEndpoints: sign0,
        pendingDir: null,
        pendingSinceMs: null,
        lastFlipAtMs: nowMs,
        fade01: 0,
      };
      this.byWire.set(wireId, s);
    }

    const beta = useAcBeta ? this.cfg.betaAc : this.cfg.betaDc;
    s.displayCurrent += beta * (solvedEndpointSigned - s.displayCurrent);

    const mag = Math.abs(s.displayCurrent);

    if (mag < this.cfg.iDead) {
      s.fade01 = Math.max(0, s.fade01 - dtSec * this.cfg.fadeOutPerSec);
      s.pendingDir = null;
      s.pendingSinceMs = null;
      return;
    }

    s.fade01 = Math.min(1, s.fade01 + dtSec * this.cfg.fadeInPerSec);
    this.runHysteresis(s, nowMs);
  }

  private runHysteresis(s: WireAnimWireState, nowMs: number): void {
    const i = s.displayCurrent;
    const dir = s.visualSignAlongEndpoints;

    const wantsPlus = i > this.cfg.iFlipOn;
    const wantsMinus = i < -this.cfg.iFlipOn;
    const relaxed = Math.abs(i) < this.cfg.iFlipOff;

    if (relaxed && s.pendingDir !== null) {
      s.pendingDir = null;
      s.pendingSinceMs = null;
    }

    let candidate: 1 | -1 | null = null;
    if (wantsPlus) candidate = 1;
    else if (wantsMinus) candidate = -1;

    if (candidate === null || candidate === dir) {
      s.pendingDir = null;
      s.pendingSinceMs = null;
      return;
    }

    if (s.pendingDir !== candidate) {
      s.pendingDir = candidate;
      s.pendingSinceMs = nowMs;
      return;
    }

    const held = nowMs - (s.pendingSinceMs ?? nowMs);
    if (
      held >= this.cfg.tHoldDirMs &&
      nowMs - s.lastFlipAtMs >= this.cfg.tMinFlipMs
    ) {
      s.visualSignAlongEndpoints = candidate;
      s.lastFlipAtMs = nowMs;
      s.pendingDir = null;
      s.pendingSinceMs = null;
    }
  }

  getDisplaySigned(wireId: string): number {
    return this.byWire.get(wireId)?.displayCurrent ?? 0;
  }

  getVisualSignAlongEndpoints(wireId: string): 1 | -1 {
    return this.byWire.get(wireId)?.visualSignAlongEndpoints ?? 1;
  }

  getFade01(wireId: string): number {
    return this.byWire.get(wireId)?.fade01 ?? 0;
  }

  /** Net coherency: invert stabilized direction without touching solver wire.current */
  flipVisualSignAlongEndpoints(wireId: string, nowMs: number): void {
    const s = this.byWire.get(wireId);
    if (!s) return;
    s.visualSignAlongEndpoints = s.visualSignAlongEndpoints === 1 ? -1 : 1;
    s.pendingDir = null;
    s.pendingSinceMs = null;
    s.lastFlipAtMs = nowMs;
  }
}
