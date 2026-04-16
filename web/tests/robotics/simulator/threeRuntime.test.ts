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
  extraMetadata?: Record<string, unknown>,
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
            ...(extraMetadata || {}),
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

function buildMaterialSupportWorld(
  frictionCoefficient: number,
  frictionCombine: "average" | "min" | "max" | "multiply" = "average",
): SimulatorWorldMap {
  return {
    id: "material_world",
    name: "material",
    grid_cell_cm: 20,
    width_cells: 40,
    height_cells: 40,
    objects: [],
    world_scene: {
      version: 1,
      gravity_m_s2: 9.81,
      objects: [
        {
          id: "support_pad",
          type: "obstacle",
          position: { x: 220, y: 0, z: 220 },
          size_cm: { x: 500, y: 4, z: 500 },
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

function runDistanceOnMaterial(
  frictionCoefficient: number,
  frictionCombine: "average" | "min" | "max" | "multiply",
): number {
  const sim = new ThreeRuntimeSimulator(TEST_ROBOT);
  sim.setWorld(buildMaterialSupportWorld(frictionCoefficient, frictionCombine));
  sim.reset({ position: { x: 100, y: 100 }, heading_deg: 0 });
  for (let i = 0; i < 50; i += 1) {
    sim.tick({ dt_ms: 50, linear_velocity_cm_s: 90, angular_velocity_deg_s: 0 });
  }
  return sim.tick({ dt_ms: 0, linear_velocity_cm_s: 0, angular_velocity_deg_s: 0 }).pose.position.x;
}

function resolveRestitutionCombine(
  restitutionCoefficient: number,
  restitutionCombine: "average" | "min" | "max" | "multiply",
): number {
  const simulator = new ThreeRuntimeSimulator(TEST_ROBOT) as any;
  return simulator.resolveCombinedRestitution({
    restitution_coefficient: restitutionCoefficient,
    restitution_combine: restitutionCombine,
  });
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

  it("changes drive response based on support-surface friction material", () => {
    const highFrictionSim = new ThreeRuntimeSimulator(TEST_ROBOT);
    const lowFrictionSim = new ThreeRuntimeSimulator(TEST_ROBOT);
    highFrictionSim.setWorld(buildMaterialSupportWorld(2.5, "average"));
    lowFrictionSim.setWorld(buildMaterialSupportWorld(0.2, "average"));
    highFrictionSim.reset({ position: { x: 100, y: 100 }, heading_deg: 0 });
    lowFrictionSim.reset({ position: { x: 100, y: 100 }, heading_deg: 0 });

    for (let i = 0; i < 50; i += 1) {
      highFrictionSim.tick({ dt_ms: 50, linear_velocity_cm_s: 90, angular_velocity_deg_s: 0 });
      lowFrictionSim.tick({ dt_ms: 50, linear_velocity_cm_s: 90, angular_velocity_deg_s: 0 });
    }

    const highPose = highFrictionSim.tick({ dt_ms: 0, linear_velocity_cm_s: 0, angular_velocity_deg_s: 0 }).pose;
    const lowPose = lowFrictionSim.tick({ dt_ms: 0, linear_velocity_cm_s: 0, angular_velocity_deg_s: 0 }).pose;
    expect(highPose.position.x).toBeGreaterThan(lowPose.position.x + 25);
  });

  it("respects friction combine mode ordering across low/high friction surfaces", () => {
    const lowMin = runDistanceOnMaterial(0.4, "min");
    const lowMultiply = runDistanceOnMaterial(0.4, "multiply");
    const lowAverage = runDistanceOnMaterial(0.4, "average");
    const lowMax = runDistanceOnMaterial(0.4, "max");
    expect(Math.abs(lowMin - lowMultiply)).toBeLessThan(0.5);
    expect(lowAverage).toBeGreaterThan(lowMin + 8);
    expect(lowMax).toBeGreaterThan(lowAverage + 8);

    const highMin = runDistanceOnMaterial(2, "min");
    const highAverage = runDistanceOnMaterial(2, "average");
    const highMax = runDistanceOnMaterial(2, "max");
    const highMultiply = runDistanceOnMaterial(2, "multiply");
    expect(highAverage).toBeGreaterThan(highMin + 8);
    expect(highMax).toBeGreaterThan(highAverage + 8);
    expect(Math.abs(highMax - highMultiply)).toBeLessThan(0.5);
  });

  it("respects restitution combine mode ordering", () => {
    const lowMin = resolveRestitutionCombine(0.4, "min");
    const lowMultiply = resolveRestitutionCombine(0.4, "multiply");
    const lowAverage = resolveRestitutionCombine(0.4, "average");
    const lowMax = resolveRestitutionCombine(0.4, "max");
    expect(lowMin).toBeCloseTo(0.05, 6);
    expect(lowMultiply).toBeCloseTo(0.02, 6);
    expect(lowAverage).toBeCloseTo(0.225, 6);
    expect(lowMax).toBeCloseTo(0.4, 6);

    const highMin = resolveRestitutionCombine(0.8, "min");
    const highAverage = resolveRestitutionCombine(0.8, "average");
    const highMax = resolveRestitutionCombine(0.8, "max");
    const highMultiply = resolveRestitutionCombine(0.8, "multiply");
    expect(highMin).toBeCloseTo(0.05, 6);
    expect(highAverage).toBeCloseTo(0.425, 6);
    expect(highMax).toBeCloseTo(0.8, 6);
    expect(highMultiply).toBeCloseTo(0.04, 6);
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

  it("traverses ramps when slope is within robot climb capability", () => {
    const simulator = new ThreeRuntimeSimulator(createRobot({ max_climb_slope_deg: 20 }));
    const world = buildWorld("obstacle", "static", undefined, {
      render_shape: "ramp",
      surface_type: "ramp",
      slope_deg: 12,
    });
    simulator.setWorld(world);
    simulator.reset({ position: { x: 135, y: 100 }, heading_deg: 180 });
    let collided = false;
    for (let i = 0; i < 30; i += 1) {
      const frame = simulator.tick({ dt_ms: 50, linear_velocity_cm_s: 80, angular_velocity_deg_s: 0 });
      if (frame.collisions.includes("obj_1")) {
        collided = true;
      }
    }
    const pose = simulator.tick({ dt_ms: 0, linear_velocity_cm_s: 0, angular_velocity_deg_s: 0 }).pose;
    expect(collided).toBe(false);
    expect(pose.position.x).toBeLessThan(112);
  });

  it("blocks ramps when slope exceeds robot climb capability", () => {
    const simulator = new ThreeRuntimeSimulator(createRobot({ max_climb_slope_deg: 10 }));
    const world = buildWorld("obstacle", "static", undefined, {
      render_shape: "ramp",
      surface_type: "ramp",
      slope_deg: 22,
    });
    simulator.setWorld(world);
    simulator.reset({ position: { x: 135, y: 100 }, heading_deg: 180 });
    let collided = false;
    for (let i = 0; i < 30; i += 1) {
      const frame = simulator.tick({ dt_ms: 50, linear_velocity_cm_s: 80, angular_velocity_deg_s: 0 });
      if (frame.collisions.includes("obj_1")) {
        collided = true;
        break;
      }
    }
    const pose = simulator.tick({ dt_ms: 0, linear_velocity_cm_s: 0, angular_velocity_deg_s: 0 }).pose;
    expect(collided).toBe(true);
    expect(pose.position.x).toBeGreaterThan(112);
  });

  it("does not block movement for sensor-only contacts", () => {
    const simulator = new ThreeRuntimeSimulator(TEST_ROBOT);
    const world = buildWorld("obstacle", "static", undefined, {
      contact_mode: "sensor_only",
    });
    simulator.setWorld(world);
    simulator.reset({ position: { x: 55, y: 100 }, heading_deg: 0 });
    let collided = false;
    for (let i = 0; i < 30; i += 1) {
      const frame = simulator.tick({ dt_ms: 50, linear_velocity_cm_s: 80, angular_velocity_deg_s: 0 });
      if (frame.collisions.includes("obj_1")) {
        collided = true;
      }
    }
    const pose = simulator.tick({ dt_ms: 0, linear_velocity_cm_s: 0, angular_velocity_deg_s: 0 }).pose;
    expect(collided).toBe(false);
    expect(pose.position.x).toBeGreaterThan(80);
  });

  it("blocks side-entry attempts on ramps even when slope is climbable", () => {
    const simulator = new ThreeRuntimeSimulator(createRobot({ max_climb_slope_deg: 25 }));
    const world = buildWorld("obstacle", "static", undefined, {
      render_shape: "ramp",
      surface_type: "ramp",
      slope_deg: 10,
    });
    simulator.setWorld(world);
    simulator.reset({ position: { x: 95, y: 65 }, heading_deg: 90 });
    let collided = false;
    for (let i = 0; i < 30; i += 1) {
      const frame = simulator.tick({ dt_ms: 50, linear_velocity_cm_s: 80, angular_velocity_deg_s: 0 });
      if (frame.collisions.includes("obj_1")) {
        collided = true;
        break;
      }
    }
    const pose = simulator.tick({ dt_ms: 0, linear_velocity_cm_s: 0, angular_velocity_deg_s: 0 }).pose;
    expect(collided).toBe(true);
    expect(pose.position.y).toBeLessThan(90);
  });

  it("supports alternate ramp entry side metadata", () => {
    const simulator = new ThreeRuntimeSimulator(createRobot({ max_climb_slope_deg: 25 }));
    const world = buildWorld("obstacle", "static", undefined, {
      render_shape: "ramp",
      surface_type: "ramp",
      slope_deg: 10,
      ramp_entry_side: "negative_x",
    });
    simulator.setWorld(world);
    simulator.reset({ position: { x: 55, y: 100 }, heading_deg: 0 });
    let collided = false;
    for (let i = 0; i < 30; i += 1) {
      const frame = simulator.tick({ dt_ms: 50, linear_velocity_cm_s: 80, angular_velocity_deg_s: 0 });
      if (frame.collisions.includes("obj_1")) {
        collided = true;
      }
    }
    const pose = simulator.tick({ dt_ms: 0, linear_velocity_cm_s: 0, angular_velocity_deg_s: 0 }).pose;
    expect(collided).toBe(false);
    expect(pose.position.x).toBeGreaterThan(80);
  });

  it("tracks grounded and elevation diagnostics while traversing ramp edges", () => {
    const simulator = new ThreeRuntimeSimulator(createRobot({ max_climb_slope_deg: 25 }));
    const world = buildWorld("obstacle", "static", undefined, {
      render_shape: "ramp",
      surface_type: "ramp",
      slope_deg: 12,
    });
    simulator.setWorld(world);
    simulator.reset({ position: { x: 135, y: 100 }, heading_deg: 180 });
    let peakElevation = 0;
    for (let i = 0; i < 60; i += 1) {
      const frame = simulator.tick({ dt_ms: 50, linear_velocity_cm_s: 80, angular_velocity_deg_s: 0 });
      const elevation = Number(frame.sensor_values.__physics_elevation_cm) || 0;
      peakElevation = Math.max(peakElevation, elevation);
    }
    const landingFrame = simulator.tick({ dt_ms: 50, linear_velocity_cm_s: 0, angular_velocity_deg_s: 0 });
    expect(peakElevation).toBeGreaterThan(1);
    expect(typeof landingFrame.sensor_values.__physics_grounded).toBe("boolean");
    expect(typeof landingFrame.sensor_values.__physics_pitch_deg).toBe("number");
    expect(typeof landingFrame.sensor_values.__physics_roll_deg).toBe("number");
  });
});
