import { describe, expect, it } from "vitest";
import { RapierRuntimeSimulator } from "../../../src/labs/robotics/simulator/rapierRuntime";
import type { SimulatorRobotModel, SimulatorWorldMap } from "../../../src/labs/robotics/simulator/types";

const TEST_ROBOT: SimulatorRobotModel = {
  wheel_base_cm: 18,
  width_cm: 20,
  length_cm: 20,
  wheel_radius_cm: 3.6,
  wheel_width_cm: 2.3,
  track_width_cm: 16,
  wheelbase_cm: 16,
  traction_longitudinal: 0.92,
  traction_lateral: 0.9,
  rolling_resistance: 4.2,
  max_wheel_accel_cm_s2: 140,
  sensors: [],
};

function buildSupportWorld(
  frictionCoefficient: number,
  frictionCombine: "average" | "min" | "max" | "multiply",
): SimulatorWorldMap {
  return {
    id: "rapier_material_world",
    name: "rapier-material",
    grid_cell_cm: 20,
    width_cells: 20,
    height_cells: 20,
    objects: [],
    world_scene: {
      version: 1,
      gravity_m_s2: 9.81,
      objects: [
        {
          id: "support_pad",
          type: "obstacle",
          position: { x: 100, y: 0, z: 100 },
          size_cm: { x: 400, y: 4, z: 400 },
          rotation_deg: { y: 0 },
          metadata: {
            physics_body: "static",
            contact_mode: "sensor_only",
            support_surface: true,
            support_surface_mode: "solid_top",
            support_priority: 100,
            friction_coefficient: frictionCoefficient,
            friction_combine: frictionCombine,
          },
        },
      ],
    },
  };
}

function resolveMaterial(
  simulator: RapierRuntimeSimulator,
  frictionCoefficient: number,
  frictionCombine: "average" | "min" | "max" | "multiply",
): { tractionScale: number; rollingResistanceScale: number } {
  simulator.setWorld(buildSupportWorld(frictionCoefficient, frictionCombine));
  simulator.reset({ position: { x: 100, y: 100 }, heading_deg: 0 });
  const internals = simulator as any;
  internals.supportSurfaceId = "support_pad";
  return internals.resolveActiveSupportMaterial();
}

function resolveCombineRule(
  simulator: RapierRuntimeSimulator,
  mode: "average" | "min" | "max" | "multiply" | "unknown",
): string | null {
  const internals = simulator as any;
  internals.rapier = {
    CoefficientCombineRule: {
      Min: "Min",
      Max: "Max",
      Multiply: "Multiply",
      Average: "Average",
    },
  };
  return internals.resolveRapierCombineRule(mode);
}

describe("RapierRuntimeSimulator material combine", () => {
  it("matches expected combine ordering for low-friction surfaces", () => {
    const simulator = new RapierRuntimeSimulator(TEST_ROBOT);
    const min = resolveMaterial(simulator, 0.4, "min").tractionScale;
    const multiply = resolveMaterial(simulator, 0.4, "multiply").tractionScale;
    const average = resolveMaterial(simulator, 0.4, "average").tractionScale;
    const max = resolveMaterial(simulator, 0.4, "max").tractionScale;

    expect(Math.abs(min - multiply)).toBeLessThan(0.001);
    expect(average).toBeGreaterThan(min);
    expect(max).toBeGreaterThan(average);
  });

  it("matches expected combine ordering for high-friction surfaces", () => {
    const simulator = new RapierRuntimeSimulator(TEST_ROBOT);
    const min = resolveMaterial(simulator, 2, "min").tractionScale;
    const average = resolveMaterial(simulator, 2, "average").tractionScale;
    const max = resolveMaterial(simulator, 2, "max").tractionScale;
    const multiply = resolveMaterial(simulator, 2, "multiply").tractionScale;

    expect(average).toBeGreaterThan(min);
    expect(max).toBeGreaterThan(average);
    expect(Math.abs(max - multiply)).toBeLessThan(0.001);
  });

  it("maps restitution/friction combine modes to Rapier rules", () => {
    const simulator = new RapierRuntimeSimulator(TEST_ROBOT);
    expect(resolveCombineRule(simulator, "min")).toBe("Min");
    expect(resolveCombineRule(simulator, "max")).toBe("Max");
    expect(resolveCombineRule(simulator, "multiply")).toBe("Multiply");
    expect(resolveCombineRule(simulator, "average")).toBe("Average");
    expect(resolveCombineRule(simulator, "unknown")).toBeNull();
  });
});
