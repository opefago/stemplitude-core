import { describe, expect, it } from "vitest";
import { KitActuatorActionFactory } from "../../../src/labs/robotics/adapters/kitActuatorActionFactory";

describe("kit actuator action factory", () => {
  it("resolves custom action handlers per kit", () => {
    const factory = new KitActuatorActionFactory().registerKitActuatorAction(
      "acme",
      "bot",
      "gripper",
      "open",
      () => ({ handled: true }),
    );
    const handler = factory.resolve({
      vendor: "acme",
      robotType: "bot",
      actuatorId: "gripper",
      action: "open",
      manifest: null,
    });
    expect(typeof handler).toBe("function");
  });

  it("returns null for unknown action handlers", () => {
    const handler = new KitActuatorActionFactory().resolve({
      vendor: "none",
      robotType: "none",
      actuatorId: "none",
      action: "none",
      manifest: null,
    });
    expect(handler).toBeNull();
  });
});

