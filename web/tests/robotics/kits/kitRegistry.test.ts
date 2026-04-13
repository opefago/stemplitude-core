import { describe, expect, it } from "vitest";
import type { RoboticsCapabilityManifest } from "../../../src/lib/robotics/types";
import {
  buildRobotModelFromManifest,
  getDefaultRobotModel,
  resolveRobotModel,
} from "../../../src/labs/robotics/adapters/kitRegistry";

describe("kit registry", () => {
  it("builds a robot model from manifest sensors", () => {
    const manifest: RoboticsCapabilityManifest = {
      vendor: "lego",
      robot_type: "spike_prime",
      display_name: "SPIKE Prime",
      languages: ["blocks", "python"],
      simulation_support: "full",
      deployment_support: "export_only",
      sensors: ["distance", "color", "gyro"],
      actuators: ["left_motor", "right_motor"],
      constraints: {},
    };

    const model = buildRobotModelFromManifest(manifest);
    expect(model.sensors.map((sensor) => sensor.kind)).toEqual(["distance", "color", "gyro"]);
  });

  it("adds gyro sensor if manifest does not provide it", () => {
    const manifest: RoboticsCapabilityManifest = {
      vendor: "custom",
      robot_type: "entry_bot",
      display_name: "Entry Bot",
      languages: ["blocks"],
      simulation_support: "partial",
      deployment_support: "none",
      sensors: ["distance", "line"],
      actuators: [],
      constraints: {},
    };
    const model = buildRobotModelFromManifest(manifest);
    expect(model.sensors.some((sensor) => sensor.kind === "gyro")).toBe(true);
  });

  it("falls back to default model when manifest is unavailable", () => {
    const model = resolveRobotModel({
      vendor: "vex",
      robotType: "vex_vr",
      manifest: null,
    });
    const fallback = getDefaultRobotModel();
    expect(model.sensors.length).toBe(fallback.sensors.length);
    expect(model.width_cm).toBe(fallback.width_cm);
  });
});
