import type { SimulatorSceneObject } from "../../labs/robotics/simulator/types";
import { GRID_CELL_CM } from "./workspaceDefaults";

export interface WorldPreset {
  id: string;
  name: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  category: string;
  widthCells: number;
  heightCells: number;
  objects: SimulatorSceneObject[];
}

function wall(id: string, x: number, z: number, w: number, d: number, rotation = 0): SimulatorSceneObject {
  return {
    id,
    type: "wall",
    position: { x, y: 0, z },
    size_cm: { x: w, y: 28, z: d },
    rotation_deg: { y: rotation },
    metadata: { color: "#6b7280", physics_body: "static" as const, palette_object_id: "nav_wall_basic" },
  };
}

function lineSegment(id: string, x: number, z: number): SimulatorSceneObject {
  return {
    id,
    type: "line_segment",
    position: { x, y: 0, z },
    size_cm: { x: GRID_CELL_CM - 2, y: 1, z: GRID_CELL_CM - 2 },
    metadata: { color: "#111827", physics_body: "static" as const, palette_object_id: "sensor_line_track" },
  };
}

function zone(id: string, x: number, z: number, w: number, d: number, color: string, type = "target_zone"): SimulatorSceneObject {
  return {
    id,
    type,
    position: { x, y: 0, z },
    size_cm: { x: w, y: 6, z: d },
    metadata: { color, physics_body: "static" as const },
  };
}

function obstacle(id: string, x: number, z: number, w: number, h: number, d: number, color: string, opts: Record<string, unknown> = {}): SimulatorSceneObject {
  return {
    id,
    type: "obstacle",
    position: { x, y: 0, z },
    size_cm: { x: w, y: h, z: d },
    metadata: { color, physics_body: "static" as const, ...opts },
  };
}

const G = GRID_CELL_CM;

export const WORLD_PRESETS: WorldPreset[] = [
  {
    id: "blank",
    name: "Blank Grid",
    description: "Empty workspace — start from scratch.",
    difficulty: "beginner",
    category: "general",
    widthCells: 40,
    heightCells: 24,
    objects: [],
  },
  {
    id: "line_following",
    name: "Line Following Course",
    description: "Figure-8 line track for optical sensor practice.",
    difficulty: "beginner",
    category: "sensor",
    widthCells: 40,
    heightCells: 24,
    objects: (() => {
      const segs: SimulatorSceneObject[] = [];
      let idx = 0;
      const path = [
        [10, 6], [12, 6], [14, 6], [16, 6], [18, 6],
        [20, 6], [20, 8], [20, 10], [18, 10], [16, 10],
        [14, 10], [12, 10], [12, 12], [12, 14], [14, 14],
        [16, 14], [18, 14], [20, 14], [20, 16], [20, 18],
        [18, 18], [16, 18], [14, 18], [12, 18], [10, 18],
        [10, 16], [10, 14], [10, 12], [10, 10], [10, 8],
      ];
      for (const [cx, cz] of path) {
        idx += 1;
        segs.push(lineSegment(`line_${idx}`, cx * G + G / 2, cz * G + G / 2));
      }
      segs.push(zone("start_zone", 10 * G + G / 2, 6 * G + G / 2, 40, 40, "#22c55e"));
      return segs;
    })(),
  },
  {
    id: "maze_runner",
    name: "Maze Runner",
    description: "Grid maze with corridors — practice distance sensing and turning.",
    difficulty: "intermediate",
    category: "navigation",
    widthCells: 30,
    heightCells: 30,
    objects: [
      wall("mw1", 6 * G, 2 * G, 6, 16 * G),
      wall("mw2", 10 * G, 6 * G, 12 * G, 6),
      wall("mw3", 16 * G, 2 * G, 6, 10 * G),
      wall("mw4", 10 * G, 12 * G, 8 * G, 6),
      wall("mw5", 20 * G, 6 * G, 6, 14 * G),
      wall("mw6", 6 * G, 20 * G, 16 * G, 6),
      wall("mw7", 14 * G, 16 * G, 6, 8 * G),
      wall("mw8", 24 * G, 14 * G, 6, 12 * G),
      zone("maze_goal", 26 * G, 26 * G, 60, 60, "#22c55e"),
    ],
  },
  {
    id: "obstacle_course",
    name: "Obstacle Course",
    description: "Walls, ramps, and pushable blocks for complex navigation.",
    difficulty: "intermediate",
    category: "navigation",
    widthCells: 50,
    heightCells: 30,
    objects: [
      wall("oc_w1", 10 * G, 8 * G, 120, 18),
      wall("oc_w2", 20 * G, 15 * G, 18, 200),
      wall("oc_w3", 35 * G, 10 * G, 160, 18),
      obstacle("oc_ramp", 15 * G, 20 * G, 52, 18, 42, "#9ca3af", { render_shape: "ramp", palette_object_id: "nav_ramp" }),
      obstacle("oc_push1", 28 * G, 8 * G, 34, 22, 34, "#ef4444", { physics_body: "dynamic", palette_object_id: "physics_pushable_block" }),
      obstacle("oc_push2", 40 * G, 22 * G, 34, 22, 34, "#f97316", { physics_body: "dynamic", palette_object_id: "physics_pushable_block" }),
      zone("oc_goal", 44 * G, 26 * G, 80, 80, "#10b981"),
    ],
  },
  {
    id: "sumo_ring",
    name: "Sumo Ring",
    description: "Circular boundary for push-off competitions.",
    difficulty: "advanced",
    category: "competition",
    widthCells: 40,
    heightCells: 40,
    objects: (() => {
      const objs: SimulatorSceneObject[] = [];
      const cx = 20 * G;
      const cz = 20 * G;
      const radius = 14 * G;
      const segments = 24;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = cx + Math.cos(angle) * radius;
        const z = cz + Math.sin(angle) * radius;
        const rotDeg = (angle * 180) / Math.PI + 90;
        objs.push(wall(`sumo_wall_${i}`, x, z, 80, 18, rotDeg));
      }
      objs.push(zone("sumo_center", cx, cz, 100, 100, "#fbbf24"));
      return objs;
    })(),
  },
  {
    id: "vex_field",
    name: "VEX Competition Field",
    description: "12x12 tile field with perimeter walls and game pieces.",
    difficulty: "advanced",
    category: "competition",
    widthCells: 90,
    heightCells: 90,
    objects: (() => {
      const fieldCm = 90 * G;
      const objs: SimulatorSceneObject[] = [
        wall("vex_n", fieldCm / 2, 0, fieldCm, 18),
        wall("vex_s", fieldCm / 2, fieldCm, fieldCm, 18),
        wall("vex_w", 0, fieldCm / 2, 18, fieldCm),
        wall("vex_e", fieldCm, fieldCm / 2, 18, fieldCm),
      ];
      for (let i = 0; i < 4; i++) {
        const x = 20 * G + i * 16 * G;
        const z = 20 * G + ((i % 2) * 30) * G;
        objs.push(obstacle(`vex_cube_${i}`, x, z, 18, 18, 18, i < 2 ? "#ef4444" : "#3b82f6", { physics_body: "dynamic", palette_object_id: "comp_cube" }));
      }
      objs.push(zone("vex_goal_r", 10 * G, 45 * G, 80, 80, "#ef4444"));
      objs.push(zone("vex_goal_b", 80 * G, 45 * G, 80, 80, "#3b82f6"));
      return objs;
    })(),
  },
  {
    id: "soccer_field",
    name: "Soccer Field",
    description: "Goals, ball, and boundary walls for robotic soccer.",
    difficulty: "intermediate",
    category: "competition",
    widthCells: 50,
    heightCells: 30,
    objects: [
      wall("sf_n", 25 * G, 0, 50 * G, 18),
      wall("sf_s", 25 * G, 30 * G, 50 * G, 18),
      wall("sf_w", 0, 15 * G, 18, 30 * G),
      wall("sf_e", 50 * G, 15 * G, 18, 30 * G),
      zone("sf_goal_l", 2 * G, 15 * G, 40, 120, "#22c55e"),
      zone("sf_goal_r", 48 * G, 15 * G, 40, 120, "#f97316"),
      obstacle("sf_ball", 25 * G, 15 * G, 18, 18, 18, "#f59e0b", { physics_body: "dynamic", render_shape: "sphere", palette_object_id: "physics_rolling_ball" }),
    ],
  },
  {
    id: "sorting_challenge",
    name: "Sorting Challenge",
    description: "Colored cubes with matching drop zones — logic and manipulation.",
    difficulty: "advanced",
    category: "mission",
    widthCells: 40,
    heightCells: 30,
    objects: [
      obstacle("sc_red1", 10 * G, 8 * G, 18, 18, 18, "#ef4444", { physics_body: "dynamic", palette_object_id: "comp_cube" }),
      obstacle("sc_blue1", 14 * G, 8 * G, 18, 18, 18, "#3b82f6", { physics_body: "dynamic", palette_object_id: "comp_cube" }),
      obstacle("sc_green1", 18 * G, 8 * G, 18, 18, 18, "#22c55e", { physics_body: "dynamic", palette_object_id: "comp_cube" }),
      obstacle("sc_red2", 22 * G, 14 * G, 18, 18, 18, "#ef4444", { physics_body: "dynamic", palette_object_id: "comp_cube" }),
      obstacle("sc_blue2", 26 * G, 14 * G, 18, 18, 18, "#3b82f6", { physics_body: "dynamic", palette_object_id: "comp_cube" }),
      zone("sc_drop_red", 8 * G, 24 * G, 60, 60, "#ef4444"),
      zone("sc_drop_blue", 20 * G, 24 * G, 60, 60, "#3b82f6"),
      zone("sc_drop_green", 32 * G, 24 * G, 60, 60, "#22c55e"),
    ],
  },
];

export function getWorldPresetById(id: string): WorldPreset | null {
  return WORLD_PRESETS.find((p) => p.id === id) ?? null;
}
