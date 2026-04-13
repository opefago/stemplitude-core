import type { RoboticsCapabilityManifest, RoboticsCodeMode, RoboticsProgram } from "../../../lib/robotics";

export interface HardwareExportPlan {
  language: "python" | "cpp";
  filename: string;
  mime_type: string;
  payload: string | Uint8Array;
}

export interface HardwareCompatibilityResult {
  compatible: boolean;
  reasons: string[];
}

export interface HardwareAdapter {
  manifest: RoboticsCapabilityManifest;
  canRunMode(mode: RoboticsCodeMode): HardwareCompatibilityResult;
  validateProgram(program: RoboticsProgram): HardwareCompatibilityResult;
  buildExport(program: RoboticsProgram, mode: RoboticsCodeMode): Promise<HardwareExportPlan>;
}

