import type { RoboticsCapabilityManifest, RoboticsProgram } from "../../../lib/robotics";

export interface BlockCompileResult {
  program: RoboticsProgram;
  diagnostics: string[];
}

export interface BlockGeneratorContext {
  manifest: RoboticsCapabilityManifest;
  mode: "beginner" | "advanced";
}

export interface BlockCompiler {
  compile(blocklyXml: string, context: BlockGeneratorContext): BlockCompileResult;
}

export interface CodePreviewResult {
  language: "python" | "cpp";
  source: string;
  editable: boolean;
  warnings: string[];
}

