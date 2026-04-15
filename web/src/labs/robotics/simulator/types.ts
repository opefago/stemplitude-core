export interface SimulatorPose2D {
  position: {
    x: number;
    y: number;
  };
  heading_deg: number;
}

export interface SimulatorWorldPose {
  position: {
    x: number;
    y: number;
  };
  heading_deg: number;
}

export interface SimulatorWorldObject {
  id: string;
  type: "obstacle" | "wall" | "target_zone" | "color_zone" | "line_segment" | string;
  pose: SimulatorWorldPose;
  dimensions_cm: {
    width: number;
    height: number;
  };
  metadata?: SimulatorSceneObjectMetadata;
}

export type SimulatorContactMode = "solid" | "sensor_only" | "pass_through";

export type SimulatorSurfaceType = "default" | "ramp" | "low_friction" | "high_friction";

export interface SimulatorSceneObjectMetadata extends Record<string, unknown> {
  physics_body?: "static" | "dynamic" | "kinematic";
  render_shape?: string;
  dynamic?: boolean;
  hidden?: boolean;
  use_gravity?: boolean;
  color?: string;
  contact_mode?: SimulatorContactMode;
  surface_type?: SimulatorSurfaceType;
  friction_coefficient?: number;
  restitution_coefficient?: number;
  slope_deg?: number;
  max_climb_slope_deg?: number;
  is_ramp_entry_blocking?: boolean;
  ramp_entry_side?: "positive_x" | "negative_x";
  ramp_side_blocking?: boolean;
  ramp_descent_assist?: number;
  linear_damping?: number;
  impulse_scale?: number;
  push_resistance?: number;
}

export interface SimulatorSceneObject {
  id: string;
  type: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  size_cm: {
    x: number;
    y: number;
    z: number;
  };
  rotation_deg?: {
    y?: number;
  };
  metadata?: SimulatorSceneObjectMetadata;
}

export interface SimulatorWorldMap {
  id: string;
  name: string;
  grid_cell_cm: number;
  width_cells: number;
  height_cells: number;
  objects: SimulatorWorldObject[];
  world_scene?: {
    version: number;
    gravity_m_s2: number;
    objects: SimulatorSceneObject[];
  };
}

export interface SimulatorTickInput {
  dt_ms: number;
  linear_velocity_cm_s: number;
  angular_velocity_deg_s: number;
}

export interface SimulatorTickOutput {
  pose: SimulatorPose2D;
  collisions: string[];
  sensor_values: Record<string, string | number | boolean>;
}

export interface SimulatorSensorMount {
  offset_cm: {
    x: number;
    y: number;
  };
  heading_offset_deg: number;
}

export interface SimulatorSensor {
  id: string;
  kind: string;
  mount: SimulatorSensorMount;
  config: Record<string, unknown>;
}

export interface SimulatorRobotModel {
  wheel_base_cm: number;
  width_cm: number;
  length_cm: number;
  wheel_radius_cm?: number;
  wheel_width_cm?: number;
  track_width_cm?: number;
  wheelbase_cm?: number;
  traction_longitudinal?: number;
  traction_lateral?: number;
  rolling_resistance?: number;
  max_wheel_accel_cm_s2?: number;
  max_climb_slope_deg?: number;
  sensors: SimulatorSensor[];
}

export interface RoboticsSimulatorBridge {
  setWorld(map: SimulatorWorldMap): void;
  reset(pose: SimulatorPose2D): void;
  tick(input: SimulatorTickInput): SimulatorTickOutput;
  setSensorOverrides?: (overrides: Record<string, number | boolean | string | null | undefined>) => void;
}
