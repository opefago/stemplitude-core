import { describe, expect, it } from "vitest";
import { ThreeRuntimeSimulator } from "../../../src/labs/robotics/simulator/threeRuntime";
import type { SimulatorRobotModel, SimulatorWorldMap } from "../../../src/labs/robotics/simulator/types";

const TEST_ROBOT: SimulatorRobotModel = {
  wheel_base_cm: 18,
  width_cm: 20,
  length_cm: 20,
  sensors: [],
};

function buildWorld(
  objectType: "obstacle" | "wall",
  physicsBody: "dynamic" | "static",
  renderShape?: "sphere",
): SimulatorWorldMap {
  return {
    id: "test_world",
    name: "test",
    grid_cell_cm: 20,
    width_cells: 20,
    height_cells: 20,
    objects: [],
    world_scene: {
      version: 1,
      gravity_m_s2: 9.81,
      objects: [
        {
          id: "obj_1",
          type: objectType,
          position: { x: 95, y: 0, z: 100 },
          size_cm: { x: 20, y: 20, z: 20 },
          rotation_deg: { y: 0 },
          metadata: {
            physics_body: physicsBody,
            ...(renderShape ? { render_shape: renderShape } : {}),
          },
        },
      ],
    },
  };
}

describe("ThreeRuntimeSimulator dynamic contacts", () => {
  it("pushes dynamic obstacles when robot contacts them", () => {
    const simulator = new ThreeRuntimeSimulator(TEST_ROBOT);
    const world = buildWorld("obstacle", "dynamic");
    simulator.setWorld(world);
    simulator.reset({ position: { x: 60, y: 100 }, heading_deg: 0 });

    for (let i = 0; i < 40; i += 1) {
      simulator.tick({ dt_ms: 50, linear_velocity_cm_s: 90, angular_velocity_deg_s: 0 });
    }

    const movedObstacle = world.world_scene?.objects.find((obj) => obj.id === "obj_1");
    expect(movedObstacle).toBeTruthy();
    expect(Number(movedObstacle?.position.x)).toBeGreaterThan(95);
  });

  it("keeps static walls fixed when contacted", () => {
    const simulator = new ThreeRuntimeSimulator(TEST_ROBOT);
    const world = buildWorld("wall", "static");
    simulator.setWorld(world);
    simulator.reset({ position: { x: 60, y: 100 }, heading_deg: 0 });

    for (let i = 0; i < 20; i += 1) {
      simulator.tick({ dt_ms: 50, linear_velocity_cm_s: 90, angular_velocity_deg_s: 0 });
    }

    const wall = world.world_scene?.objects.find((obj) => obj.id === "obj_1");
    expect(Number(wall?.position.x)).toBe(95);
  });

  it("updates rolling metadata for dynamic sphere obstacles", () => {
    const simulator = new ThreeRuntimeSimulator(TEST_ROBOT);
    const world = buildWorld("obstacle", "dynamic", "sphere");
    simulator.setWorld(world);
    simulator.reset({ position: { x: 60, y: 100 }, heading_deg: 0 });

    for (let i = 0; i < 20; i += 1) {
      simulator.tick({ dt_ms: 50, linear_velocity_cm_s: 90, angular_velocity_deg_s: 0 });
    }

    const ball = world.world_scene?.objects.find((obj) => obj.id === "obj_1");
    expect(Math.abs(Number(ball?.metadata?.roll_x_deg) || 0) + Math.abs(Number(ball?.metadata?.roll_z_deg) || 0)).toBeGreaterThan(0);
  });
});
