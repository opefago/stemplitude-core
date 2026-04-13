import { describe, expect, it } from "vitest";
import {
  resolveKitActuatorActionHandler,
  resolveKitCapabilities,
  resolveKitRuntimeBehavior,
} from "../../../src/labs/robotics";

describe("built-in kit registration", () => {
  it("loads built-in VEX VR profile from bootstrap registry", () => {
    const capabilities = resolveKitCapabilities({
      vendor: "vex",
      robotType: "vex_vr",
      manifest: null,
    });
    expect(capabilities.sensors.map((sensor) => sensor.kind)).toEqual(["distance", "line", "color", "bumper", "gyro"]);
    expect(capabilities.actuators.map((actuator) => actuator.kind)).toEqual([
      "left_motor",
      "right_motor",
      "arm_motor",
    ]);
  });

  it("loads built-in VEX VR runtime behavior profile", () => {
    const profile = resolveKitRuntimeBehavior({
      vendor: "vex",
      robotType: "vex_vr",
      manifest: null,
    });
    expect(profile.maxLinearSpeedCmS).toBeGreaterThan(0);
    expect(profile.maxTurnSpeedDegS).toBeGreaterThan(0);
    expect(profile.motorBehaviors.left_motor?.mode).toBe("turn");
    expect(profile.motorBehaviors.right_motor?.mode).toBe("turn");
  });

  it("loads built-in VEX VR actuator action handlers", () => {
    const handler = resolveKitActuatorActionHandler({
      vendor: "vex",
      robotType: "vex_vr",
      actuatorId: "arm_motor",
      action: "set_speed",
      manifest: null,
    });
    expect(typeof handler).toBe("function");
  });
});

