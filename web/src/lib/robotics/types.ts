export type RoboticsCodeMode = "blocks" | "hybrid" | "python" | "cpp";

export type RoboticsExecutionState = "idle" | "running" | "paused" | "completed" | "error";

export type RoboticsRunMode = "simulate" | "hardware_export";

export type SensorKind =
  | "distance"
  | "line"
  | "color"
  | "bumper"
  | "gyro"
  | "touch"
  | "custom";

export interface RoboticsProjectSource {
  blocks_xml?: string | null;
  ir?: RoboticsProgram | null;
  text_code?: string | null;
}

export interface RoboticsProjectDocument {
  schema_version: number;
  title: string;
  robot_vendor: string;
  robot_type: string;
  mode: RoboticsCodeMode;
  editor_mode?: "code" | "sim" | "split";
  project_source?: "manual" | "curriculum_lab" | "track_lesson_resource" | "default";
  source: RoboticsProjectSource;
  world_scene?: Record<string, unknown>;
  runtime_settings?: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface RoboticsCapabilityManifest {
  vendor: string;
  robot_type: string;
  display_name: string;
  languages: RoboticsCodeMode[];
  simulation_support: "none" | "partial" | "full";
  deployment_support: "none" | "export_only" | "direct_flash";
  sensors: SensorKind[] | string[];
  actuators: string[];
  constraints: Record<string, unknown>;
}

export interface RoboticsProgram {
  version: number;
  entrypoint: string;
  nodes: RoboticsIRNode[];
  functions?: RoboticsFunctionIR[];
}

export interface RoboticsFunctionIR {
  id: string;
  name: string;
  params: string[];
  body: RoboticsIRNode[];
}

export type RoboticsIRNode =
  | RoboticsMoveNode
  | RoboticsTurnNode
  | RoboticsWaitNode
  | RoboticsSetMotorNode
  | RoboticsActuatorActionNode
  | RoboticsReturnNode
  | RoboticsIfNode
  | RoboticsRepeatNode
  | RoboticsSensorReadNode
  | RoboticsEmitEventNode
  | RoboticsCallNode
  | RoboticsAssignNode;

interface RoboticsNodeBase {
  id: string;
  kind: string;
}

export interface RoboticsMoveNode extends RoboticsNodeBase {
  kind: "move";
  direction: "forward" | "backward";
  unit: "distance_cm" | "distance_mm" | "distance_in" | "seconds";
  value: number;
  speed_pct?: number;
}

export interface RoboticsTurnNode extends RoboticsNodeBase {
  kind: "turn";
  direction: "left" | "right";
  angle_deg: number;
  speed_pct?: number;
}

export interface RoboticsWaitNode extends RoboticsNodeBase {
  kind: "wait";
  seconds: number;
}

export interface RoboticsSetMotorNode extends RoboticsNodeBase {
  kind: "set_motor";
  motor_id: string;
  speed_pct: number;
  duration_sec?: number;
}

export interface RoboticsActuatorActionNode extends RoboticsNodeBase {
  kind: "actuator_action";
  actuator_id: string;
  action: string;
  value?: string | number | boolean;
  duration_sec?: number;
}

export interface RoboticsIfNode extends RoboticsNodeBase {
  kind: "if";
  condition: RoboticsCondition;
  then_nodes: RoboticsIRNode[];
  else_nodes?: RoboticsIRNode[];
}

export interface RoboticsRepeatNode extends RoboticsNodeBase {
  kind: "repeat";
  times?: number;
  while?: RoboticsCondition;
  body: RoboticsIRNode[];
}

export interface RoboticsSensorReadNode extends RoboticsNodeBase {
  kind: "read_sensor";
  sensor: SensorKind;
  output_var: string;
}

export interface RoboticsEmitEventNode extends RoboticsNodeBase {
  kind: "emit_event";
  event_name: string;
  payload?: Record<string, unknown>;
}

export interface RoboticsCallNode extends RoboticsNodeBase {
  kind: "call";
  function_id: string;
  args?: RoboticsExpression[];
}

export interface RoboticsAssignNode extends RoboticsNodeBase {
  kind: "assign";
  variable: string;
  value: RoboticsExpression;
}

export interface RoboticsReturnNode extends RoboticsNodeBase {
  kind: "return";
  value?: RoboticsExpression;
}

export type RoboticsCondition =
  | { op: "sensor_gt"; sensor: SensorKind; value: number }
  | { op: "sensor_lt"; sensor: SensorKind; value: number }
  | { op: "eq"; left: RoboticsExpression; right: RoboticsExpression }
  | { op: "and"; conditions: RoboticsCondition[] }
  | { op: "or"; conditions: RoboticsCondition[] }
  | { op: "not"; condition: RoboticsCondition };

export type RoboticsExpression =
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "string"; value: string }
  | { type: "var"; name: string }
  | { type: "sensor"; sensor: SensorKind }
  | { type: "binary"; op: "add" | "sub" | "mul" | "div"; left: RoboticsExpression; right: RoboticsExpression };

export interface RoboticsAttemptRecord {
  id: string;
  project_id: string;
  mission_id: string;
  run_mode: RoboticsRunMode;
  status: "running" | "completed" | "failed" | "cancelled";
  score?: number | null;
  telemetry: Record<string, unknown>;
  created_at: string;
  completed_at?: string | null;
}

export interface RoboticsEventRecord {
  event_name: string;
  occurred_at: string;
  project_id?: string;
  attempt_id?: string;
  actor_id?: string;
  payload: Record<string, unknown>;
}

