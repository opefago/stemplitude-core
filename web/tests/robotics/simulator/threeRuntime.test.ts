import { describe, expect, it } from "vitest";
import { ThreeRuntimeSimulator } from "../../../src/labs/robotics/simulator/threeRuntime";
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

function createRobot(overrides: Partial<SimulatorRobotModel>): SimulatorRobotModel {
  return {
    ...TEST_ROBOT,
    ...overrides,
  };
}

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

function buildEmptyWorld(): SimulatorWorldMap {
  return {
    id: "test_world_empty",
    name: "test",
    grid_cell_cm: 20,
    width_cells: 40,
    height_cells: 40,
    objects: [],
    world_scene: {
      version: 1,
      gravity_m_s2: 9.81,
      objects: [],
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

  it("keeps fast movement from tunneling through thin walls", () => {
    const simulator = new ThreeRuntimeSimulator(TEST_ROBOT);
    const world = buildWorld("wall", "static");
    if (world.world_scene?.objects?.[0]) {
      world.world_scene.objects[0].size_cm = { x: 4, y: 20, z: 60 };
      world.world_scene.objects[0].position = { x: 100, y: 0, z: 100 };
    }
    simulator.setWorld(world);
    simulator.reset({ position: { x: 40, y: 100 }, heading_deg: 0 });
    let collided = false;
    for (let i = 0; i < 120; i += 1) {
      const frame = simulator.tick({ dt_ms: 50, linear_velocity_cm_s: 400, angular_velocity_deg_s: 0 });
      if (frame.collisions.includes("obj_1")) {
        collided = true;
        break;
      }
    }
    const pose = simulator.tick({ dt_ms: 0, linear_velocity_cm_s: 0, angular_velocity_deg_s: 0 }).pose;
    expect(collided).toBe(true);
    expect(pose.position.x).toBeLessThanOrEqual(110);
  });

  it("applies gravity to dynamic spheres above the workplane", () => {
    const simulator = new ThreeRuntimeSimulator(TEST_ROBOT);
    const world = buildWorld("obstacle", "dynamic", "sphere");
    if (world.world_scene?.objects?.[0]) {
      world.world_scene.objects[0].position.y = 40;
      world.world_scene.objects[0].metadata = {
        ...(world.world_scene.objects[0].metadata || {}),
        use_gravity: true,
      };
    }
    simulator.setWorld(world);
    simulator.reset({ position: { x: 40, y: 40 }, heading_deg: 0 });
    for (let i = 0; i < 30; i += 1) {
      simulator.tick({ dt_ms: 50, linear_velocity_cm_s: 0, angular_velocity_deg_s: 0 });
    }
    const ball = world.world_scene?.objects.find((obj) => obj.id === "obj_1");
    expect(Number(ball?.position.y)).toBeLessThan(40);
    expect(Number(ball?.position.y)).toBeGreaterThanOrEqual(0);
  });

  it("accelerates more slowly with lower longitudinal traction", () => {
    const highTraction = new ThreeRuntimeSimulator(createRobot({ traction_longitudinal: 1.2 }));
    const lowTraction = new ThreeRuntimeSimulator(createRobot({ traction_longitudinal: 0.2 }));
    const world = buildEmptyWorld();
    highTraction.setWorld(world);
    lowTraction.setWorld(structuredClone(world));
    highTraction.reset({ position: { x: 100, y: 100 }, heading_deg: 0 });
    lowTraction.reset({ position: { x: 100, y: 100 }, heading_deg: 0 });

    for (let i = 0; i < 40; i += 1) {
      highTraction.tick({ dt_ms: 50, linear_velocity_cm_s: 100, angular_velocity_deg_s: 0 });
      lowTraction.tick({ dt_ms: 50, linear_velocity_cm_s: 100, angular_velocity_deg_s: 0 });
    }

    const fastPose = highTraction.tick({ dt_ms: 0, linear_velocity_cm_s: 0, angular_velocity_deg_s: 0 }).pose;
    const slowPose = lowTraction.tick({ dt_ms: 0, linear_velocity_cm_s: 0, angular_velocity_deg_s: 0 }).pose;
    expect(fastPose.position.x).toBeGreaterThan(slowPose.position.x + 18);
  });

  it("turns less aggressively with wider track width under the same traction", () => {
    const narrowTrack = new ThreeRuntimeSimulator(
      createRobot({ track_width_cm: 10, traction_lateral: 0.8, wheelbase_cm: 14 }),
    );
    const wideTrack = new ThreeRuntimeSimulator(
      createRobot({ track_width_cm: 24, traction_lateral: 0.8, wheelbase_cm: 14 }),
    );
    const world = buildWorld("wall", "static");
    narrowTrack.setWorld(world);
    wideTrack.setWorld(structuredClone(world));
    narrowTrack.reset({ position: { x: 80, y: 80 }, heading_deg: 0 });
    wideTrack.reset({ position: { x: 80, y: 80 }, heading_deg: 0 });

    for (let i = 0; i < 20; i += 1) {
      narrowTrack.tick({ dt_ms: 50, linear_velocity_cm_s: 10, angular_velocity_deg_s: 120 });
      wideTrack.tick({ dt_ms: 50, linear_velocity_cm_s: 10, angular_velocity_deg_s: 120 });
    }

    const narrowHeading = narrowTrack.tick({ dt_ms: 0, linear_velocity_cm_s: 0, angular_velocity_deg_s: 0 }).pose.heading_deg;
    const wideHeading = wideTrack.tick({ dt_ms: 0, linear_velocity_cm_s: 0, angular_velocity_deg_s: 0 }).pose.heading_deg;
    expect(narrowHeading).toBeGreaterThan(wideHeading + 5);
  });

  it("is deterministic for repeated command streams", () => {
    const runReplay = () => {
      const simulator = new ThreeRuntimeSimulator(TEST_ROBOT);
      simulator.setWorld(buildWorld("obstacle", "dynamic", "sphere"));
      simulator.reset({ position: { x: 30, y: 30 }, heading_deg: 15 });
      for (let i = 0; i < 60; i += 1) {
        simulator.tick({
          dt_ms: 30,
          linear_velocity_cm_s: i < 30 ? 70 : 35,
          angular_velocity_deg_s: i < 20 ? 45 : -30,
        });
      }
      return simulator.tick({ dt_ms: 0, linear_velocity_cm_s: 0, angular_velocity_deg_s: 0 }).pose;
    };

    const first = runReplay();
    const second = runReplay();
    expect(first.position.x).toBeCloseTo(second.position.x, 6);
    expect(first.position.y).toBeCloseTo(second.position.y, 6);
    expect(first.heading_deg).toBeCloseTo(second.heading_deg, 6);
  });
});
