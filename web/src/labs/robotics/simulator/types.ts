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
  metadata?: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
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
  sensors: SimulatorSensor[];
}

export interface RoboticsSimulatorBridge {
  setWorld(map: SimulatorWorldMap): void;
  reset(pose: SimulatorPose2D): void;
  tick(input: SimulatorTickInput): SimulatorTickOutput;
  setSensorOverrides?: (overrides: Record<string, number | boolean | string | null | undefined>) => void;
}
