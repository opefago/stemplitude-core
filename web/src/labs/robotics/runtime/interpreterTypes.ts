import type { SyntaxNode } from "@lezer/common";
import type {
  RoboticsCondition,
  RoboticsExpression,
  RoboticsProgram,
  SensorKind,
} from "../../../lib/robotics";
import type { IssueCategory, IssueCode, IssueSeverity } from "./issueCodes";

export interface InterpreterDiagnostic {
  code: IssueCode;
  severity: IssueSeverity;
  category: Exclude<IssueCategory, "runtime">;
  message: string;
  line?: number;
}

export interface TextInterpretResult {
  ok: boolean;
  program: RoboticsProgram;
  diagnostics: string[];
  issues: InterpreterDiagnostic[];
}

export interface BaseInterpreterContext {
  asNumber: (value: string) => number;
  splitTopLevel: (input: string, needle: string) => string[];
  normalizeSensorName: (sensor: string) => SensorKind;
  isSensorAllowed: (sensor: SensorKind) => boolean;
  parseExpression: (value: string) => RoboticsExpression | null;
  parseCondition: (value: string) => RoboticsCondition | null;
  diagnoseCondition: (value: string) => string | null;
  textOf: (source: string, node: SyntaxNode) => string;
  lineNumberAt: (source: string, offset: number) => number;
  childrenOf: (node: SyntaxNode) => SyntaxNode[];
  firstChildByNames: (node: SyntaxNode, names: string[]) => SyntaxNode | null;
  fallbackFalseCondition: () => RoboticsCondition;
}

export type PythonInterpreterContext = BaseInterpreterContext;
export type CppInterpreterContext = BaseInterpreterContext;
