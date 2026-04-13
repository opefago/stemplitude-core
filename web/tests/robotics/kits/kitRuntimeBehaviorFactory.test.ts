import { describe, expect, it } from "vitest";
import { KitRuntimeBehaviorFactory } from "../../../src/labs/robotics/adapters/kitRuntimeBehaviorFactory";

describe("kit runtime behavior factory", () => {
  it("resolves registered runtime behavior profiles by kit key", () => {
    const factory = new KitRuntimeBehaviorFactory().registerKitBehavior("acme", "bot_a", {
      maxLinearSpeedCmS: 40,
      maxTurnSpeedDegS: 220,
      motorBehaviors: {
        drive: { mode: "linear", axisSign: 1, maxSpeed: 40 },
      },
    });
    const profile = factory.resolve({
      vendor: "acme",
      robotType: "bot_a",
      manifest: null,
    });
    expect(profile.maxLinearSpeedCmS).toBe(40);
    expect(profile.maxTurnSpeedDegS).toBe(220);
    expect(profile.motorBehaviors.drive?.mode).toBe("linear");
  });

  it("falls back to baseline runtime profile when kit is unknown", () => {
    const profile = new KitRuntimeBehaviorFactory().resolve({
      vendor: "unknown",
      robotType: "unknown",
      manifest: null,
    });
    expect(profile.maxLinearSpeedCmS).toBeGreaterThan(0);
    expect(profile.maxTurnSpeedDegS).toBeGreaterThan(0);
  });
});

