import type { Point } from "./ComponentTypes";

export type WireVisualState = {
  currentMagnitude: number;
  currentDirection: 1 | -1 | 0;
  voltageDrop?: number;
  energized: boolean;
  particleRate: number;
  glowLevel: number;
  debugText?: string;
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
