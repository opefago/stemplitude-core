import type { Point } from "./ComponentTypes";

export type WireVisualState = {
  currentMagnitude: number;
  currentDirection: 1 | -1 | 0;
  voltageDrop?: number;
  energized: boolean;
  particleRate: number;
  glowLevel: number;
  debugText?: string;
  /** Fract aligned phase from merged-net coupling so branches on the same bus stay visually in sync */
  phaseShift?: number;
};

export type WireParticle = {
  wireId: string;
  progress: number;
  speed: number;
  alpha: number;
  active: boolean;
};

export type WirePathCache = {
  wireId: string;
  worldPoints: Point[];
  totalLength: number;
  segmentLengths: number[];
  segmentCumulativeLengths: number[];
};

export function createDefaultWireVisualState(): WireVisualState {
  return {
    currentMagnitude: 0,
    currentDirection: 0,
    energized: false,
    particleRate: 0,
    glowLevel: 0,
  };
}
