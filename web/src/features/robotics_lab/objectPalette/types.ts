export type ObjectDifficulty = "beginner" | "advanced";

export type ObjectCategoryId =
  | "navigation_mapping"
  | "sensor_detection"
  | "interactive_physics"
  | "mission_scoring"
  | "environment_effects"
  | "multi_agent_dynamic"
  | "logic_event"
  | "competition_field";

export type SimulatorPlacementShape = "box" | "sphere" | "cylinder" | "flat_zone";

export type SimulatorPhysicsBodyType = "static" | "dynamic" | "kinematic";

export type EditablePropertyControl =
  | "number"
  | "boolean"
  | "color"
  | "select"
  | "vector3"
  | "text";

export interface EditablePropertyDescriptor {
  id: string;
  label: string;
  control: EditablePropertyControl;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  unit?: string;
}

export interface SensorInteractionDefinition {
  sensorKind: string;
  behavior: string;
}

export interface SimulatorObjectEventDefinition {
  event: string;
  description: string;
}

export interface SimulatorObjectPlacementDefaults {
  objectType: string;
  shape: SimulatorPlacementShape;
  sizeCm: { x: number; y: number; z: number };
  color: string;
  physicsBody: SimulatorPhysicsBodyType;
  renderShape?:
    | "box"
    | "sphere"
    | "cylinder"
    | "flat_rect"
    | "ramp"
    | "waypoint_marker"
    | "ring"
    | "disc";
}

export interface SimulatorObjectPhysicsBehavior {
  bodyType: SimulatorPhysicsBodyType;
  movable: boolean;
  friction?: number;
  restitution?: number;
  damping?: number;
  massKg?: number;
  notes?: string;
}

export interface SimulatorObjectDefinition {
  id: string;
  displayName: string;
  description: string;
  categoryId: ObjectCategoryId;
  icon: string;
  difficulty: ObjectDifficulty;
  tags: string[];
  aliases?: string[];
  placement: SimulatorObjectPlacementDefaults;
  editableProperties: EditablePropertyDescriptor[];
  physicsBehavior: SimulatorObjectPhysicsBehavior;
  sensorInteraction: SensorInteractionDefinition[];
  eventsEmitted: SimulatorObjectEventDefinition[];
  runtimeMetadata?: Record<string, unknown>;
}

export interface ObjectCategoryDefinition {
  id: ObjectCategoryId;
  displayName: string;
  description: string;
  icon: string;
  keywords: string[];
}

