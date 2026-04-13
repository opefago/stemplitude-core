import type { RoboticsProgram, SensorKind } from "../../lib/robotics";

export const GRID_CELL_CM = 20;
export const GRID_CELL_PX = 16;

export const START_POSE = {
  position: { x: 4 * GRID_CELL_CM, y: 4 * GRID_CELL_CM },
  heading_deg: 0,
};

export const BASE_WORLD = {
  id: "mission_intro",
  name: "Intro Obstacle Course",
  grid_cell_cm: GRID_CELL_CM,
  width_cells: 40,
  height_cells: 24,
  objects: [
    {
      id: "obstacle_1",
      type: "obstacle",
      pose: { position: { x: 12 * GRID_CELL_CM, y: 10 * GRID_CELL_CM }, heading_deg: 0 },
      dimensions_cm: { width: GRID_CELL_CM * 2, height: GRID_CELL_CM * 2 },
      metadata: {},
    },
    {
      id: "zone_goal",
      type: "target_zone",
      pose: { position: { x: 34 * GRID_CELL_CM, y: 18 * GRID_CELL_CM }, heading_deg: 0 },
      dimensions_cm: { width: GRID_CELL_CM * 4, height: GRID_CELL_CM * 4 },
      metadata: { value: "goal" },
    },
  ],
};

export const SAMPLE_PROGRAM: RoboticsProgram = {
  version: 1,
  entrypoint: "main",
  nodes: [
    { id: "n1", kind: "move", direction: "forward", unit: "distance_cm", value: 140, speed_pct: 75 },
    { id: "n2", kind: "turn", direction: "right", angle_deg: 90, speed_pct: 80 },
    { id: "n3", kind: "move", direction: "forward", unit: "distance_cm", value: 90, speed_pct: 70 },
    { id: "n4", kind: "read_sensor", sensor: "distance", output_var: "front_dist" },
    { id: "n5", kind: "wait", seconds: 0.3 },
  ],
};

export const FALLBACK_MANIFESTS = [
  { vendor: "vex", robot_type: "vex_vr", display_name: "VEX VR", languages: ["blocks", "hybrid", "python"] },
];

export const BLOCK_LIBRARY = [
  {
    category: "Motion",
    colorClass: "motion",
    blocks: [
      { type: "move_forward", label: "Move Forward", hint: "Drive 80 cm" },
      { type: "move_backward", label: "Move Backward", hint: "Reverse 60 cm" },
      { type: "turn_right", label: "Turn Right", hint: "Rotate 90 deg" },
      { type: "turn_left", label: "Turn Left", hint: "Rotate 90 deg" },
      { type: "wait", label: "Wait", hint: "Pause 0.5 sec" },
    ],
  },
  {
    category: "Sensors",
    colorClass: "sensor",
    blocks: [
      { type: "read_distance", label: "Read Distance", hint: "Store front sensor value" },
      { type: "read_color", label: "Read Color", hint: "Detect floor color zone" },
      { type: "read_gyro", label: "Read Heading", hint: "Store current heading" },
    ],
  },
];

export function inferNextNodeId(program: RoboticsProgram) {
  const maxNumericId = (program?.nodes || []).reduce((maxId, node) => {
    const match = /^n(\d+)$/.exec(String(node?.id || ""));
    if (!match) return maxId;
    return Math.max(maxId, Number(match[1]));
  }, 0);
  return maxNumericId + 1;
}

export function safeProgram(program: RoboticsProgram | null | undefined): RoboticsProgram {
  if (!program || !Array.isArray(program.nodes) || program.nodes.length === 0) {
    return SAMPLE_PROGRAM;
  }
  return {
    version: typeof program.version === "number" ? program.version : 1,
    entrypoint: program.entrypoint || "main",
    nodes: program.nodes,
  };
}

export function makeProgramNodeFromBlock(blockType: string, nodeId: string) {
  switch (blockType) {
    case "move_forward":
      return { id: nodeId, kind: "move", direction: "forward", unit: "distance_cm", value: 80, speed_pct: 70 };
    case "move_backward":
      return { id: nodeId, kind: "move", direction: "backward", unit: "distance_cm", value: 60, speed_pct: 60 };
    case "turn_left":
      return { id: nodeId, kind: "turn", direction: "left", angle_deg: 90, speed_pct: 75 };
    case "turn_right":
      return { id: nodeId, kind: "turn", direction: "right", angle_deg: 90, speed_pct: 75 };
    case "wait":
      return { id: nodeId, kind: "wait", seconds: 0.5 };
    case "read_distance":
      return { id: nodeId, kind: "read_sensor", sensor: "distance" as SensorKind, output_var: "distance_cm" };
    case "read_color":
      return { id: nodeId, kind: "read_sensor", sensor: "color" as SensorKind, output_var: "floor_color" };
    case "read_gyro":
      return { id: nodeId, kind: "read_sensor", sensor: "gyro" as SensorKind, output_var: "heading_deg" };
    default:
      return null;
  }
}

export function describeNode(node: { kind: string; [key: string]: unknown }) {
  if (node.kind === "move") {
    const unitLabel =
      node.unit === "distance_cm"
        ? "cm"
        : node.unit === "distance_mm"
          ? "mm"
          : node.unit === "distance_in"
            ? "in"
            : "s";
    return `${node.direction} ${node.value} ${unitLabel}`;
  }
  if (node.kind === "turn") {
    return `${node.direction} ${node.angle_deg} deg`;
  }
  if (node.kind === "wait") {
    return `wait ${node.seconds}s`;
  }
  if (node.kind === "read_sensor") {
    return `read ${node.sensor} -> ${node.output_var}`;
  }
  return node.kind;
}

export function toNumberOr(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getRobotModel() {
  return {
    wheel_base_cm: 14,
    width_cm: 16,
    length_cm: 18,
    sensors: [
      { id: "distance", kind: "distance", mount: { offset_cm: { x: 5, y: 0 }, heading_offset_deg: 0 }, config: { max_range_cm: 250 } },
      { id: "line", kind: "line", mount: { offset_cm: { x: 0, y: 0 }, heading_offset_deg: 0 }, config: {} },
      { id: "color", kind: "color", mount: { offset_cm: { x: 0, y: 0 }, heading_offset_deg: 0 }, config: {} },
      { id: "bumper", kind: "bumper", mount: { offset_cm: { x: 7, y: 0 }, heading_offset_deg: 0 }, config: {} },
      { id: "gyro", kind: "gyro", mount: { offset_cm: { x: 0, y: 0 }, heading_offset_deg: 0 }, config: {} },
    ],
  };
}
