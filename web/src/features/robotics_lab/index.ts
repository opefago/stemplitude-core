export type RoboticsLabMode = "blocks" | "hybrid" | "python" | "cpp";

export interface RoboticsLabViewState {
  mode: RoboticsLabMode;
  selectedRobotVendor: string;
  selectedRobotType: string;
  selectedMissionId: string | null;
}

export const DEFAULT_ROBOTICS_LAB_STATE: RoboticsLabViewState = {
  mode: "blocks",
  selectedRobotVendor: "vex",
  selectedRobotType: "vex_vr",
  selectedMissionId: null,
};

