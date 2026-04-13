import type { CameraMode, OverlayState } from "./types";

export const DEFAULT_OVERLAY_STATE: OverlayState = {
  showGrid: true,
  showSensors: true,
  showPathTrail: true,
  showHeading: true,
  showRobotFootprint: false,
};

export function mergeOverlayState(
  base: OverlayState,
  overrides: Partial<OverlayState>,
): OverlayState {
  return { ...base, ...overrides };
}

export function overlayOpacityForMode(mode: CameraMode) {
  switch (mode) {
    case "top":
      return { sensor: 0.85, heading: 0.9, trail: 0.7 };
    case "follow":
      return { sensor: 0.7, heading: 0.75, trail: 0.55 };
    case "perspective":
      return { sensor: 0.8, heading: 0.85, trail: 0.65 };
    default:
      return { sensor: 0.8, heading: 0.85, trail: 0.65 };
  }
}
