import { describe, expect, it } from "vitest";
import { KitCapabilitiesFactory } from "../../../src/labs/robotics/adapters/kitCapabilitiesFactory";

describe("kit capabilities factory", () => {
  it("resolves manifest-provided sensors and actuators", () => {
    const factory = new KitCapabilitiesFactory()
      .registerSensorCapability({ kind: "distance", label: "Distance", override: { type: "number" } })
      .registerSensorCapability({ kind: "color", label: "Color", override: { type: "select", options: ["default"] } })
      .registerActuatorCapability({ kind: "left_motor", label: "Left Motor" });

    const capabilities = factory.resolve({
      vendor: "lego",
      robotType: "spike_prime",
      manifest: {
        vendor: "lego",
        robot_type: "spike_prime",
        display_name: "SPIKE Prime",
        languages: ["blocks", "python"],
        simulation_support: "full",
        deployment_support: "export_only",
        sensors: ["distance", "color"],
        actuators: ["left_motor"],
        constraints: {},
      },
    });

    expect(capabilities.sensors.map((sensor) => sensor.kind)).toEqual(["distance", "color"]);
    expect(capabilities.actuators.map((actuator) => actuator.kind)).toEqual(["left_motor"]);
  });

  it("supports kit profile registration for plug-in kits", () => {
    const factory = new KitCapabilitiesFactory()
      .registerSensorCapability({ kind: "ir", label: "IR", override: { type: "number" } })
      .registerActuatorCapability({ kind: "gripper", label: "Gripper" })
      .registerKit("acme", "acme_bot_v2", {
        sensorKinds: ["ir"],
        actuatorKinds: ["gripper"],
      });

    const capabilities = factory.resolve({
      vendor: "acme",
      robotType: "acme_bot_v2",
      manifest: null,
    });

    expect(capabilities.sensors[0]?.label).toBe("IR");
    expect(capabilities.actuators[0]?.label).toBe("Gripper");
  });

  it("falls back to baseline defaults when no metadata exists", () => {
    const factory = new KitCapabilitiesFactory();
    const capabilities = factory.resolve({
      vendor: "unknown",
      robotType: "unknown",
      manifest: null,
    });
    expect(capabilities.sensors.length).toBeGreaterThan(0);
    expect(capabilities.actuators.length).toBeGreaterThan(0);
  });
});

