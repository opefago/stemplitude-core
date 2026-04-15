import { describe, expect, it } from "vitest";
import {
  midpoint3,
  normalizeHeadingDeg,
  planarDistanceCm,
  shouldAcceptSample,
  signedAngleDeltaDeg,
} from "../../../../src/labs/robotics/view/measurement/math";
import { formatDistanceCm, formatTurnLabel } from "../../../../src/labs/robotics/view/measurement/units";

describe("measurement math", () => {
  it("normalizes headings and signed deltas", () => {
    expect(normalizeHeadingDeg(-10)).toBe(350);
    expect(normalizeHeadingDeg(725)).toBe(5);
    expect(signedAngleDeltaDeg(350, 10)).toBe(20);
    expect(signedAngleDeltaDeg(10, 350)).toBe(-20);
  });

  it("calculates planar distance and midpoint", () => {
    expect(planarDistanceCm({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
    expect(midpoint3({ x: 0, y: 0, z: 0 }, { x: 10, y: 4, z: 6 })).toEqual({ x: 5, y: 2, z: 3 });
  });

  it("accepts significant movement or heading updates", () => {
    expect(shouldAcceptSample({ x: 0, z: 0, headingDeg: 0 }, { x: 0.2, z: 0.2, headingDeg: 0.3 }, 1)).toBe(false);
    expect(shouldAcceptSample({ x: 0, z: 0, headingDeg: 0 }, { x: 1.4, z: 0, headingDeg: 0.3 }, 1)).toBe(true);
    expect(shouldAcceptSample({ x: 0, z: 0, headingDeg: 0 }, { x: 0, z: 0, headingDeg: 2 }, 1)).toBe(true);
  });

  it("formats distances and turn labels", () => {
    expect(formatDistanceCm(120, "m", 20)).toBe("1.2 m");
    expect(formatDistanceCm(40, "tiles", 20)).toBe("2 tiles");
    expect(formatTurnLabel(90.3)).toBe("+90°");
    expect(formatTurnLabel(-44.6)).toBe("-45°");
  });
});

