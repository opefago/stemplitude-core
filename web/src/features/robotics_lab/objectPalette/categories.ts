import type { ObjectCategoryDefinition } from "./types";

export const OBJECT_CATEGORIES: ObjectCategoryDefinition[] = [
  {
    id: "navigation_mapping",
    displayName: "Navigation & Mapping",
    description: "Build routes, barriers, and wayfinding landmarks.",
    icon: "Map",
    keywords: ["navigation", "maze", "map", "waypoint", "path", "route"],
  },
  {
    id: "sensor_detection",
    displayName: "Sensor & Detection",
    description: "Train line, color, light, and trigger sensing behaviors.",
    icon: "Radar",
    keywords: ["sensor", "line", "reflective", "beacon", "light", "tag"],
  },
  {
    id: "interactive_physics",
    displayName: "Interactive & Physics",
    description: "Practice manipulation with movable and dynamic objects.",
    icon: "Package",
    keywords: ["physics", "push", "pickup", "rolling", "stack", "drop"],
  },
  {
    id: "mission_scoring",
    displayName: "Mission & Scoring",
    description: "Create objectives, checkpoints, and scoring systems.",
    icon: "Trophy",
    keywords: ["mission", "scoring", "goal", "checkpoint", "basket", "gate"],
  },
  {
    id: "environment_effects",
    displayName: "Environment Effects",
    description: "Modify traction, motion flow, and terrain response.",
    icon: "Wind",
    keywords: ["friction", "conveyor", "wind", "terrain", "surface", "platform"],
  },
  {
    id: "multi_agent_dynamic",
    displayName: "Multi-Agent & Dynamic",
    description: "Run scenarios with additional bots and moving agents.",
    icon: "Bot",
    keywords: ["agent", "patrol", "follow", "avoid", "robot", "cooperate"],
  },
  {
    id: "logic_event",
    displayName: "Logic & Event Objects",
    description: "Design trigger/signal based event-driven challenges.",
    icon: "Workflow",
    keywords: ["trigger", "signal", "switch", "gate", "logic", "stateful"],
  },
  {
    id: "competition_field",
    displayName: "Competition Field Elements",
    description: "Build competition-style fields and scoring pieces.",
    icon: "Flag",
    keywords: ["competition", "field", "ring", "disc", "cube", "tower", "perimeter"],
  },
];

export const OBJECT_CATEGORY_BY_ID = new Map(OBJECT_CATEGORIES.map((category) => [category.id, category]));

