import { describe, expect, it } from "vitest";
import { MeasurementOverlayManager } from "../../../../src/labs/robotics/view/measurement/MeasurementOverlayManager";

describe("MeasurementOverlayManager", () => {
  it("tracks instructional segments and turn markers", () => {
    const manager = new MeasurementOverlayManager({
      minSampleDistanceCm: 0.5,
      minSegmentDistanceCm: 1,
      turnAngleThresholdDeg: 8,
      distanceUnit: "cm",
    });

    manager.startRun({ x: 10, z: 10, headingDeg: 0 }, 0);
    manager.updatePose({ x: 30, z: 10, headingDeg: 0 }, 50);
    manager.updatePose({ x: 50, z: 10, headingDeg: 0 }, 100);
    manager.updatePose({ x: 50, z: 10, headingDeg: 90 }, 140);
    manager.updatePose({ x: 50, z: 30, headingDeg: 90 }, 190);
    const state = manager.endRun({ x: 50, z: 50, headingDeg: 90 }, 260);

    expect(state.segments.length).toBeGreaterThanOrEqual(2);
    expect(state.turns.length).toBe(1);
    expect(state.summary.totalDistanceCm).toBeGreaterThan(35);
    expect(state.summary.turnCount).toBe(1);
    expect(state.startMarker).toEqual({ x: 10, y: 0, z: 10 });
    expect(state.endMarker).toEqual({ x: 50, y: 0, z: 50 });
  });

  it("supports continuous mode and reset", () => {
    const manager = new MeasurementOverlayManager({
      mode: "continuous",
      minSampleDistanceCm: 0.1,
      minSegmentDistanceCm: 0.1,
    });
    manager.startRun({ x: 0, z: 0, headingDeg: 0 }, 0);
    manager.updatePose({ x: 5, z: 0, headingDeg: 0 }, 16);
    manager.updatePose({ x: 10, z: 0, headingDeg: 0 }, 32);
    const beforeReset = manager.getState();
    expect(beforeReset.samples.length).toBeGreaterThanOrEqual(3);
    expect(beforeReset.mode).toBe("continuous");

    const afterReset = manager.reset();
    expect(afterReset.samples).toHaveLength(0);
    expect(afterReset.segments).toHaveLength(0);
    expect(afterReset.turns).toHaveLength(0);
    expect(afterReset.summary.totalDistanceCm).toBe(0);
  });
});

