import type { SyntaxNode } from "@lezer/common";
import type {
  RoboticsCodeMode,
  RoboticsCondition,
  RoboticsExpression,
  RoboticsProgram,
  SensorKind,
} from "../../../lib/robotics";
import { parseCppLegacy, parseCppWithAst } from "./cppInterpreter";
import type {
  BaseInterpreterContext,
  CppInterpreterContext,
  InterpreterDiagnostic,
  PythonInterpreterContext,
  TextInterpretResult,
} from "./interpreterTypes";
import { ISSUE_CODES } from "./issueCodes";
import type { IssueCode } from "./issueCodes";
import { parsePythonLegacy, parsePythonWithAst } from "./pythonInterpreter";

export type {
  BaseInterpreterContext,
  CppInterpreterContext,
  InterpreterDiagnostic,
  PythonInterpreterContext,
  TextInterpretResult,
} from "./interpreterTypes";

function emptyProgram(): RoboticsProgram {
  return { version: 1, entrypoint: "main", nodes: [] };
}

function createInterpreterIssue(
  code: IssueCode,
  category: "syntax" | "semantic",
  message: string,
  line?: number,
): InterpreterDiagnostic {
  return {
    code,
    severity: "error",
    category,
    message,
    line,
  };
}

function withStructuredDiagnostics(
  result: TextInterpretResult,
  fallbackIssues?: InterpreterDiagnostic[],
): TextInterpretResult {
  return {
    ...result,
    issues: fallbackIssues && fallbackIssues.length > 0 ? fallbackIssues : result.issues,
  };
}

export function asNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function splitTopLevel(input: string, needle: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString: "'" | '"' | null = null;
  let start = 0;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inString) {
      if (ch === inString && input[i - 1] !== "\\") inString = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inString = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && input.slice(i, i + needle.length) === needle) {
      parts.push(input.slice(start, i).trim());
      start = i + needle.length;
      i += needle.length - 1;
    }
  }
  parts.push(input.slice(start).trim());
  return parts.filter(Boolean);
}

export function normalizeSensorName(sensor: string): SensorKind {
  return sensor as SensorKind;
}

function hasBalancedOuterParens(value: string): boolean {
  if (!value.startsWith("(") || !value.endsWith(")")) return false;
  let depth = 0;
  let inString: "'" | '"' | null = null;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (inString) {
      if (ch === inString && value[i - 1] !== "\\") inString = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inString = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") {
      depth -= 1;
      if (depth === 0 && i < value.length - 1) return false;
    }
    if (depth < 0) return false;
  }
  return depth === 0;
}

function parseSensorCall(input: string, startIndex: number): { sensor: SensorKind; nextIndex: number } | null {
  const prefix = "robot.read_sensor(";
  if (!input.startsWith(prefix, startIndex)) return null;
  let index = startIndex + prefix.length;
  const quote = input[index];
  if (quote !== "'" && quote !== '"') return null;
  index += 1;
  let sensor = "";
  while (index < input.length && input[index] !== quote) {
    sensor += input[index];
    index += 1;
  }
  if (index >= input.length || input[index] !== quote) return null;
  index += 1;
  while (index < input.length && /\s/.test(input[index])) index += 1;
  if (input[index] !== ")") return null;
  index += 1;
  if (!/^[A-Za-z_]+$/.test(sensor)) return null;
  return {
    sensor: normalizeSensorName(sensor),
    nextIndex: index,
  };
}

export function parseExpression(value: string): RoboticsExpression | null {
  const source = value.trim();
  if (!source) return null;
  let index = 0;

  function skipWs() {
    while (index < source.length && /\s/.test(source[index])) index += 1;
  }

  function parsePrimary(): RoboticsExpression | null {
    skipWs();
    if (index >= source.length) return null;
    const ch = source[index];
    if (ch === "(") {
      index += 1;
      const expr = parseAddSub();
      skipWs();
      if (!expr || source[index] !== ")") return null;
      index += 1;
      return expr;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      index += 1;
      let str = "";
      while (index < source.length && source[index] !== quote) {
        str += source[index];
        index += 1;
      }
      if (index >= source.length || source[index] !== quote) return null;
      index += 1;
      return { type: "string", value: str };
    }
    const sensorCall = parseSensorCall(source, index);
    if (sensorCall) {
      index = sensorCall.nextIndex;
      return { type: "sensor", sensor: sensorCall.sensor };
    }
    const numberMatch = source.slice(index).match(/^[-+]?\d*\.?\d+/);
    if (numberMatch) {
      index += numberMatch[0].length;
      return { type: "number", value: asNumber(numberMatch[0]) };
    }
    const booleanMatch = source.slice(index).match(/^(true|True|false|False)\b/);
    if (booleanMatch) {
      index += booleanMatch[0].length;
      return { type: "boolean", value: /^(true|True)$/.test(booleanMatch[0]) };
    }
    const variableMatch = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (variableMatch) {
      index += variableMatch[0].length;
      return { type: "var", name: variableMatch[0] };
    }
    return null;
  }

  function parseUnary(): RoboticsExpression | null {
    skipWs();
    if (source[index] === "+") {
      index += 1;
      return parseUnary();
    }
    if (source[index] === "-") {
      index += 1;
      const rhs = parseUnary();
      if (!rhs) return null;
      return {
        type: "binary",
        op: "sub",
        left: { type: "number", value: 0 },
        right: rhs,
      };
    }
    return parsePrimary();
  }

  function parseMulDiv(): RoboticsExpression | null {
    let left = parseUnary();
    if (!left) return null;
    while (true) {
      skipWs();
      const op = source[index];
      if (op !== "*" && op !== "/") break;
      index += 1;
      const right = parseUnary();
      if (!right) return null;
      left = {
        type: "binary",
        op: op === "*" ? "mul" : "div",
        left,
        right,
      };
    }
    return left;
  }

  function parseAddSub(): RoboticsExpression | null {
    let left = parseMulDiv();
    if (!left) return null;
    while (true) {
      skipWs();
      const op = source[index];
      if (op !== "+" && op !== "-") break;
      index += 1;
      const right = parseMulDiv();
      if (!right) return null;
      left = {
        type: "binary",
        op: op === "+" ? "add" : "sub",
        left,
        right,
      };
    }
    return left;
  }

  const expression = parseAddSub();
  if (!expression) return null;
  skipWs();
  return index === source.length ? expression : null;
}

function parseComparisonCondition(raw: string): RoboticsCondition | null {
  function tokenizeComparisonChain(input: string): { parts: string[]; operators: string[] } | null {
    const parts: string[] = [];
    const operators: string[] = [];
    let depth = 0;
    let inString: "'" | '"' | null = null;
    let start = 0;
    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      if (inString) {
        if (ch === inString && input[i - 1] !== "\\") inString = null;
        continue;
      }
      if (ch === "'" || ch === '"') {
        inString = ch;
        continue;
      }
      if (ch === "(") {
        depth += 1;
        continue;
      }
      if (ch === ")") {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (depth !== 0) continue;
      const two = input.slice(i, i + 2);
      let matchedOp: string | null = null;
      if (two === "==" || two === "!=" || two === ">=" || two === "<=") {
        matchedOp = two;
      } else if (ch === ">" || ch === "<") {
        matchedOp = ch;
      }
      if (matchedOp) {
        parts.push(input.slice(start, i).trim());
        operators.push(matchedOp);
        start = i + matchedOp.length;
        i += matchedOp.length - 1;
      }
    }
    if (operators.length === 0) return null;
    parts.push(input.slice(start).trim());
    if (parts.length !== operators.length + 1) return null;
    if (parts.some((part) => !part)) return null;
    return { parts, operators };
  }

  const chain = tokenizeComparisonChain(raw);
  if (!chain) return null;
  const { parts: chainParts, operators: chainOperators } = chain;
  if (chainOperators.length > 1) {
    const conditions: RoboticsCondition[] = [];
    for (let i = 0; i < chainOperators.length; i += 1) {
      const left = chainParts[i];
      const right = chainParts[i + 1];
      const op = chainOperators[i];
      const parsed = parseComparisonCondition(`${left} ${op} ${right}`);
      if (!parsed) return null;
      conditions.push(parsed);
    }
    return {
      op: "and",
      conditions,
    };
  }

  const op = chainOperators[0];
  const leftExpr = parseExpression(chainParts[0]);
  const rightExpr = parseExpression(chainParts[1]);
  if (!leftExpr || !rightExpr) return null;
  if (op === "==") return { op: "eq", left: leftExpr, right: rightExpr };
  if (op === "!=") {
    return {
      op: "not",
      condition: { op: "eq", left: leftExpr, right: rightExpr },
    };
  }
  if (leftExpr.type === "sensor" && rightExpr.type === "number") {
    if (op === ">=") {
      return {
        op: "not",
        condition: { op: "sensor_lt", sensor: leftExpr.sensor, value: rightExpr.value },
      };
    }
    if (op === "<=") {
      return {
        op: "not",
        condition: { op: "sensor_gt", sensor: leftExpr.sensor, value: rightExpr.value },
      };
    }
    return {
      op: op === ">" ? "sensor_gt" : "sensor_lt",
      sensor: leftExpr.sensor,
      value: rightExpr.value,
    };
  }
  if (rightExpr.type === "sensor" && leftExpr.type === "number") {
    if (op === ">=") {
      return {
        op: "not",
        condition: { op: "sensor_gt", sensor: rightExpr.sensor, value: leftExpr.value },
      };
    }
    if (op === "<=") {
      return {
        op: "not",
        condition: { op: "sensor_lt", sensor: rightExpr.sensor, value: leftExpr.value },
      };
    }
    return {
      op: op === ">" ? "sensor_lt" : "sensor_gt",
      sensor: rightExpr.sensor,
      value: leftExpr.value,
    };
  }
  return null;
}

export function diagnoseCondition(rawValue: string): string | null {
  const raw = rawValue.trim();
  if (!raw) return "condition is empty";
  const withoutOuter = hasBalancedOuterParens(raw) ? raw.slice(1, -1).trim() : raw;
  const chainOperatorPattern = /(==|!=|>=|<=|>|<)/g;
  const chainParts = withoutOuter.split(chainOperatorPattern).map((part) => part.trim()).filter(Boolean);
  if (chainParts.length < 3) return null;
  for (let i = 1; i < chainParts.length; i += 2) {
    const op = chainParts[i];
    if (op === "==" || op === "!=") continue;
    const leftText = chainParts[i - 1];
    const rightText = chainParts[i + 1];
    const leftExpr = parseExpression(leftText);
    const rightExpr = parseExpression(rightText);
    if (!leftExpr || !rightExpr) {
      return `unsupported comparator operands around "${leftText} ${op} ${rightText}"`;
    }
    const isSensorThreshold =
      (leftExpr.type === "sensor" && rightExpr.type === "number") ||
      (rightExpr.type === "sensor" && leftExpr.type === "number");
    if (!isSensorThreshold) {
      return `unsupported comparator "${leftText} ${op} ${rightText}" (only sensor-to-number threshold comparisons are supported)`;
    }
  }
  return null;
}

export function parseCondition(rawValue: string): RoboticsCondition | null {
  const raw = rawValue.trim();
  if (!raw) return null;
  const withoutOuter = hasBalancedOuterParens(raw) ? raw.slice(1, -1).trim() : raw;

  const orParts = splitTopLevel(withoutOuter, " or ");
  if (orParts.length > 1) {
    const children = orParts.map(parseCondition).filter(Boolean) as RoboticsCondition[];
    return children.length === orParts.length ? { op: "or", conditions: children } : null;
  }
  const andParts = splitTopLevel(withoutOuter, " and ");
  if (andParts.length > 1) {
    const children = andParts.map(parseCondition).filter(Boolean) as RoboticsCondition[];
    return children.length === andParts.length ? { op: "and", conditions: children } : null;
  }
  if (withoutOuter.startsWith("not ")) {
    const child = parseCondition(withoutOuter.slice(4));
    return child ? { op: "not", condition: child } : null;
  }

  const comparison = parseComparisonCondition(withoutOuter);
  if (comparison) return comparison;

  const expr = parseExpression(withoutOuter);
  if (expr) return { op: "eq", left: expr, right: { type: "boolean", value: true } };
  return null;
}

export function textOf(source: string, node: SyntaxNode): string {
  return source.slice(node.from, node.to);
}

export function lineNumberAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === "\n") line += 1;
  }
  return line;
}

export function childrenOf(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  let cursor = node.firstChild;
  while (cursor) {
    children.push(cursor);
    cursor = cursor.nextSibling;
  }
  return children;
}

export function firstChildByNames(node: SyntaxNode, names: string[]): SyntaxNode | null {
  for (const name of names) {
    const child = node.getChild(name);
    if (child) return child;
  }
  return null;
}

function fallbackFalseCondition(): RoboticsCondition {
  return {
    op: "eq",
    left: { type: "boolean", value: false },
    right: { type: "boolean", value: true },
  };
}

function buildInterpreterContext(): BaseInterpreterContext {
  return {
    asNumber,
    splitTopLevel,
    normalizeSensorName,
    parseExpression,
    parseCondition,
    diagnoseCondition,
    textOf,
    lineNumberAt,
    childrenOf,
    firstChildByNames,
    fallbackFalseCondition,
  };
}

export function interpretTextProgram(code: string, mode: RoboticsCodeMode): TextInterpretResult {
  if (!code.trim()) {
    const message = "Text editor is empty; nothing to run in simulator.";
    return withStructuredDiagnostics({
      ok: false,
      diagnostics: [message],
      program: emptyProgram(),
      issues: [],
    }, [createInterpreterIssue(ISSUE_CODES.EMPTY_SOURCE, "syntax", message)]);
  }

  const context = buildInterpreterContext();
  if (mode === "python") {
    const astResult = parsePythonWithAst(code, context);
    if (astResult.ok) return withStructuredDiagnostics(astResult);
    const fallback = parsePythonLegacy(code, context);
    if (fallback.ok) return withStructuredDiagnostics(fallback);
    const combinedIssues = [...(astResult.issues || []), ...(fallback.issues || [])];
    return withStructuredDiagnostics({
      ...fallback,
      diagnostics: [...astResult.diagnostics, ...fallback.diagnostics],
    }, combinedIssues);
  }
  if (mode === "cpp") {
    const astResult = parseCppWithAst(code, context);
    if (astResult.ok) return withStructuredDiagnostics(astResult);
    const fallback = parseCppLegacy(code, context);
    if (fallback.ok) return withStructuredDiagnostics(fallback);
    const combinedIssues = [...(astResult.issues || []), ...(fallback.issues || [])];
    return withStructuredDiagnostics({
      ...fallback,
      diagnostics: [...astResult.diagnostics, ...fallback.diagnostics],
    }, combinedIssues);
  }

  return withStructuredDiagnostics({
    ok: false,
    diagnostics: [`Interpreter only supports text modes (python/cpp). Received mode: ${mode}`],
    program: emptyProgram(),
    issues: [],
  }, [
    createInterpreterIssue(
      ISSUE_CODES.UNSUPPORTED_SYNTAX,
      "syntax",
      `Interpreter only supports text modes (python/cpp). Received mode: ${mode}`,
    ),
  ]);
}
