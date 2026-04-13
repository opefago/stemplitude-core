import type { SyntaxNode } from "@lezer/common";
import { parser as pythonAstParser } from "@lezer/python";
import type { RoboticsCondition, RoboticsExpression, RoboticsIRNode, RoboticsProgram } from "../../../lib/robotics";
import type { InterpreterDiagnostic, PythonInterpreterContext, TextInterpretResult } from "./interpreterTypes";
import { ISSUE_CODES } from "./issueCodes";
import type { IssueCode } from "./issueCodes";

type PythonLine = { number: number; indent: number; raw: string; text: string };

function reportPythonIssue(
  diagnostics: string[],
  issues: InterpreterDiagnostic[],
  code: IssueCode,
  category: "syntax" | "semantic",
  message: string,
  line?: number,
) {
  diagnostics.push(message);
  issues.push({
    code,
    severity: "error",
    category,
    message,
    line,
  });
}

function validateSensorKindForKit(
  sensor: string,
  line: number,
  diagnostics: string[],
  issues: InterpreterDiagnostic[],
  context: PythonInterpreterContext,
): boolean {
  const normalized = context.normalizeSensorName(sensor);
  if (context.isSensorAllowed(normalized)) return true;
  reportPythonIssue(
    diagnostics,
    issues,
    ISSUE_CODES.KIT_CAPABILITY_MISMATCH,
    "semantic",
    `Line ${line}: sensor "${sensor}" is not available for the selected kit`,
    line,
  );
  return false;
}

function validateExpressionSensorsForKit(
  expression: RoboticsExpression,
  line: number,
  diagnostics: string[],
  issues: InterpreterDiagnostic[],
  context: PythonInterpreterContext,
) {
  if (expression.type === "sensor") {
    validateSensorKindForKit(expression.sensor, line, diagnostics, issues, context);
    return;
  }
  if (expression.type === "binary") {
    validateExpressionSensorsForKit(expression.left, line, diagnostics, issues, context);
    validateExpressionSensorsForKit(expression.right, line, diagnostics, issues, context);
  }
}

function validateConditionSensorsForKit(
  condition: RoboticsCondition,
  line: number,
  diagnostics: string[],
  issues: InterpreterDiagnostic[],
  context: PythonInterpreterContext,
) {
  if (condition.op === "sensor_gt" || condition.op === "sensor_lt") {
    validateSensorKindForKit(condition.sensor, line, diagnostics, issues, context);
    return;
  }
  if (condition.op === "eq") {
    validateExpressionSensorsForKit(condition.left, line, diagnostics, issues, context);
    validateExpressionSensorsForKit(condition.right, line, diagnostics, issues, context);
    return;
  }
  if (condition.op === "not") {
    validateConditionSensorsForKit(condition.condition, line, diagnostics, issues, context);
    return;
  }
  if (condition.op === "and" || condition.op === "or") {
    condition.conditions.forEach((child) =>
      validateConditionSensorsForKit(child, line, diagnostics, issues, context));
  }
}

function parsePythonStatement(
  line: PythonLine,
  nextId: () => string,
  diagnostics: string[],
  issues: InterpreterDiagnostic[],
  context: PythonInterpreterContext,
): RoboticsIRNode | null {
  let match = line.text.match(/^robot\.move_(forward|backward)\(([-+]?\d*\.?\d+),\s*speed_pct=([-+]?\d*\.?\d+)\)$/);
  if (match) {
    return {
      id: nextId(),
      kind: "move",
      direction: match[1] as "forward" | "backward",
      unit: "distance_cm",
      value: context.asNumber(match[2]),
      speed_pct: context.asNumber(match[3]),
    };
  }
  match = line.text.match(/^robot\.move_(forward|backward)_for\(([-+]?\d*\.?\d+),\s*speed_pct=([-+]?\d*\.?\d+)\)$/);
  if (match) {
    return {
      id: nextId(),
      kind: "move",
      direction: match[1] as "forward" | "backward",
      unit: "seconds",
      value: context.asNumber(match[2]),
      speed_pct: context.asNumber(match[3]),
    };
  }
  match = line.text.match(/^robot\.turn_(left|right)\(([-+]?\d*\.?\d+),\s*speed_pct=([-+]?\d*\.?\d+)\)$/);
  if (match) {
    return {
      id: nextId(),
      kind: "turn",
      direction: match[1] as "left" | "right",
      angle_deg: context.asNumber(match[2]),
      speed_pct: context.asNumber(match[3]),
    };
  }
  match = line.text.match(/^robot\.wait\(([-+]?\d*\.?\d+)\)$/);
  if (match) {
    return { id: nextId(), kind: "wait", seconds: context.asNumber(match[1]) };
  }
  match = line.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*robot\.read_sensor\("([A-Za-z_]+)"\)$/);
  if (match) {
    validateSensorKindForKit(match[2], line.number, diagnostics, issues, context);
    return {
      id: nextId(),
      kind: "read_sensor",
      output_var: match[1],
      sensor: context.normalizeSensorName(match[2]),
    };
  }
  match = line.text.match(/^return(?:\s+(.+))?$/);
  if (match) {
    const rawValue = match[1]?.trim();
    if (!rawValue) {
      return { id: nextId(), kind: "return" };
    }
    const expr = context.parseExpression(rawValue);
    if (!expr) {
      reportPythonIssue(
        diagnostics,
        issues,
        ISSUE_CODES.UNSUPPORTED_SYNTAX,
        "syntax",
        `Line ${line.number}: unsupported return expression "${rawValue}"`,
        line.number,
      );
      return null;
    }
    validateExpressionSensorsForKit(expr, line.number, diagnostics, issues, context);
    return { id: nextId(), kind: "return", value: expr };
  }
  match = line.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
  if (match) {
    const expr = context.parseExpression(match[2]);
    if (!expr) {
      reportPythonIssue(
        diagnostics,
        issues,
        ISSUE_CODES.UNSUPPORTED_SYNTAX,
        "syntax",
        `Line ${line.number}: unsupported assignment expression "${match[2]}"`,
        line.number,
      );
      return null;
    }
    validateExpressionSensorsForKit(expr, line.number, diagnostics, issues, context);
    return { id: nextId(), kind: "assign", variable: match[1], value: expr };
  }
  match = line.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/);
  if (match) {
    const functionId = match[1];
    const rawArgs = match[2].trim();
    const args: RoboticsExpression[] = [];
    if (rawArgs.length > 0) {
      const parts = context.splitTopLevel(rawArgs, ",");
      for (const part of parts) {
        const expr = context.parseExpression(part);
        if (!expr) {
          reportPythonIssue(
            diagnostics,
            issues,
            ISSUE_CODES.UNSUPPORTED_SYNTAX,
            "syntax",
            `Line ${line.number}: unsupported call argument "${part}"`,
            line.number,
          );
          return null;
        }
        validateExpressionSensorsForKit(expr, line.number, diagnostics, issues, context);
        args.push(expr);
      }
    }
    return { id: nextId(), kind: "call", function_id: functionId, args };
  }
  reportPythonIssue(
    diagnostics,
    issues,
    ISSUE_CODES.UNSUPPORTED_SYNTAX,
    "syntax",
    `Line ${line.number}: unsupported Python statement "${line.text}"`,
    line.number,
  );
  return null;
}

function parsePythonStatementFromAst(
  source: string,
  node: SyntaxNode,
  nextId: () => string,
  diagnostics: string[],
  issues: InterpreterDiagnostic[],
  context: PythonInterpreterContext,
): RoboticsIRNode | null {
  const line = context.lineNumberAt(source, node.from);
  const statementText = context.textOf(source, node).trim();
  return parsePythonStatement(
    {
      number: line,
      indent: 0,
      raw: statementText,
      text: statementText,
    },
    nextId,
    diagnostics,
    issues,
    context,
  );
}

function parsePythonBodyNodes(
  source: string,
  container: SyntaxNode,
  nextId: () => string,
  diagnostics: string[],
  issues: InterpreterDiagnostic[],
  context: PythonInterpreterContext,
): RoboticsIRNode[] {
  const nodes: RoboticsIRNode[] = [];
  for (const child of context.childrenOf(container)) {
    if (child.name === "ExpressionStatement" || child.name === "AssignStatement" || child.name === "ReturnStatement") {
      const nextNode = parsePythonStatementFromAst(source, child, nextId, diagnostics, issues, context);
      if (nextNode) nodes.push(nextNode);
      continue;
    }
    if (child.name === "IfStatement") {
      const conditionNode = context.firstChildByNames(child, [
        "BinaryExpression",
        "CallExpression",
        "ParenthesizedExpression",
        "VariableName",
      ]);
      const conditionText = conditionNode ? context.textOf(source, conditionNode) : "";
      const condition = context.parseCondition(conditionText);
      const conditionLine = context.lineNumberAt(source, child.from);
      if (!condition) {
        const detail = context.diagnoseCondition(conditionText);
        reportPythonIssue(
          diagnostics,
          issues,
          ISSUE_CODES.UNSUPPORTED_SYNTAX,
          "syntax",
          `Line ${conditionLine}: unsupported if condition "${conditionText.trim()}"${detail ? ` (${detail})` : ""}`,
          conditionLine,
        );
      } else {
        validateConditionSensorsForKit(condition, conditionLine, diagnostics, issues, context);
      }
      const bodies = child.getChildren("Body");
      const thenNodes = bodies[0] ? parsePythonBodyNodes(source, bodies[0], nextId, diagnostics, issues, context) : [];
      const elseNodes = bodies[1] ? parsePythonBodyNodes(source, bodies[1], nextId, diagnostics, issues, context) : undefined;
      nodes.push({
        id: nextId(),
        kind: "if",
        condition: condition ?? context.fallbackFalseCondition(),
        then_nodes: thenNodes,
        else_nodes: elseNodes,
      });
      continue;
    }
    if (child.name === "ForStatement") {
      const call = child.getChild("CallExpression");
      const callText = call ? context.textOf(source, call).trim() : "";
      const rangeMatch = callText.match(/^range\(([-+]?\d+)(?:,\s*([-+]?\d+))?(?:,\s*([-+]?\d+))?\)$/);
      let times = 0;
      if (rangeMatch) {
        const start = rangeMatch[2] ? context.asNumber(rangeMatch[1]) : 0;
        const end = rangeMatch[2] ? context.asNumber(rangeMatch[2]) : context.asNumber(rangeMatch[1]);
        const step = rangeMatch[3] ? context.asNumber(rangeMatch[3]) : 1;
        if (step !== 0) {
          times = Math.max(0, Math.floor((end - start) / step));
        }
      } else {
        reportPythonIssue(
          diagnostics,
          issues,
          ISSUE_CODES.UNSUPPORTED_SYNTAX,
          "syntax",
          `Line ${context.lineNumberAt(source, child.from)}: unsupported for range "${callText}"`,
          context.lineNumberAt(source, child.from),
        );
      }
      const body = child.getChild("Body");
      nodes.push({
        id: nextId(),
        kind: "repeat",
        times,
        body: body ? parsePythonBodyNodes(source, body, nextId, diagnostics, issues, context) : [],
      });
      continue;
    }
    if (child.name === "WhileStatement") {
      const conditionNode = context.firstChildByNames(child, [
        "BinaryExpression",
        "CallExpression",
        "ParenthesizedExpression",
        "VariableName",
      ]);
      const conditionText = conditionNode ? context.textOf(source, conditionNode) : "";
      const condition = context.parseCondition(conditionText);
      const conditionLine = context.lineNumberAt(source, child.from);
      if (!condition) {
        const detail = context.diagnoseCondition(conditionText);
        reportPythonIssue(
          diagnostics,
          issues,
          ISSUE_CODES.UNSUPPORTED_SYNTAX,
          "syntax",
          `Line ${conditionLine}: unsupported while condition "${conditionText.trim()}"${detail ? ` (${detail})` : ""}`,
          conditionLine,
        );
      } else {
        validateConditionSensorsForKit(condition, conditionLine, diagnostics, issues, context);
      }
      const body = child.getChild("Body");
      nodes.push({
        id: nextId(),
        kind: "repeat",
        while: condition ?? context.fallbackFalseCondition(),
        body: body ? parsePythonBodyNodes(source, body, nextId, diagnostics, issues, context) : [],
      });
      continue;
    }
  }
  return nodes;
}

function parsePythonLines(code: string): PythonLine[] {
  const wrappers = [/^def main\(\):$/, /^if __name__ == ['"]__main__['"]:\s*$/, /^main\(\)\s*$/];
  const rows = code.split(/\r?\n/);
  const lines: PythonLine[] = [];
  rows.forEach((raw, index) => {
    if (!raw.trim() || raw.trim().startsWith("#")) return;
    if (raw.trim() === "pass") return;
    if (raw.trim().startsWith("import ")) return;
    if (wrappers.some((re) => re.test(raw.trim()))) return;
    const indent = raw.length - raw.trimStart().length;
    lines.push({ number: index + 1, indent, raw, text: raw.trim() });
  });
  return lines;
}

function parsePythonBlock(
  lines: PythonLine[],
  startIndex: number,
  indent: number,
  nextId: () => string,
  diagnostics: string[],
  issues: InterpreterDiagnostic[],
  context: PythonInterpreterContext,
): { nodes: RoboticsIRNode[]; index: number } {
  const nodes: RoboticsIRNode[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      reportPythonIssue(
        diagnostics,
        issues,
        ISSUE_CODES.UNSUPPORTED_SYNTAX,
        "syntax",
        `Line ${line.number}: unexpected indentation`,
        line.number,
      );
      index += 1;
      continue;
    }

    let match = line.text.match(/^if\s+(.+):$/);
    if (match) {
      const condition = context.parseCondition(match[1]);
      if (!condition) {
        const detail = context.diagnoseCondition(match[1]);
        reportPythonIssue(
          diagnostics,
          issues,
          ISSUE_CODES.UNSUPPORTED_SYNTAX,
          "syntax",
          `Line ${line.number}: unsupported if condition "${match[1]}"${detail ? ` (${detail})` : ""}`,
          line.number,
        );
      } else {
        validateConditionSensorsForKit(condition, line.number, diagnostics, issues, context);
      }
      const thenIndent = lines[index + 1]?.indent ?? indent + 2;
      const thenParsed = parsePythonBlock(lines, index + 1, thenIndent, nextId, diagnostics, issues, context);
      let elseNodes: RoboticsIRNode[] | undefined;
      index = thenParsed.index;
      if (index < lines.length && lines[index].indent === indent && /^else:\s*$/.test(lines[index].text)) {
        const elseIndent = lines[index + 1]?.indent ?? indent + 2;
        const elseParsed = parsePythonBlock(lines, index + 1, elseIndent, nextId, diagnostics, issues, context);
        elseNodes = elseParsed.nodes;
        index = elseParsed.index;
      }
      nodes.push({
        id: nextId(),
        kind: "if",
        condition: condition ?? context.fallbackFalseCondition(),
        then_nodes: thenParsed.nodes,
        else_nodes: elseNodes,
      });
      continue;
    }

    match = line.text.match(/^for\s+[A-Za-z_][A-Za-z0-9_]*\s+in\s+range\(([-+]?\d+)\):$/);
    if (match) {
      const bodyIndent = lines[index + 1]?.indent ?? indent + 2;
      const parsed = parsePythonBlock(lines, index + 1, bodyIndent, nextId, diagnostics, issues, context);
      nodes.push({
        id: nextId(),
        kind: "repeat",
        times: Math.max(0, Math.floor(context.asNumber(match[1]))),
        body: parsed.nodes,
      });
      index = parsed.index;
      continue;
    }

    match = line.text.match(/^while\s+(.+):$/);
    if (match) {
      const condition = context.parseCondition(match[1]);
      if (!condition) {
        const detail = context.diagnoseCondition(match[1]);
        reportPythonIssue(
          diagnostics,
          issues,
          ISSUE_CODES.UNSUPPORTED_SYNTAX,
          "syntax",
          `Line ${line.number}: unsupported while condition "${match[1]}"${detail ? ` (${detail})` : ""}`,
          line.number,
        );
      } else {
        validateConditionSensorsForKit(condition, line.number, diagnostics, issues, context);
      }
      const bodyIndent = lines[index + 1]?.indent ?? indent + 2;
      const parsed = parsePythonBlock(lines, index + 1, bodyIndent, nextId, diagnostics, issues, context);
      nodes.push({
        id: nextId(),
        kind: "repeat",
        while: condition ?? context.fallbackFalseCondition(),
        body: parsed.nodes,
      });
      index = parsed.index;
      continue;
    }

    const node = parsePythonStatement(line, nextId, diagnostics, issues, context);
    if (node) nodes.push(node);
    index += 1;
  }
  return { nodes, index };
}

export function parsePythonWithAst(code: string, context: PythonInterpreterContext): TextInterpretResult {
  let nodeIndex = 1;
  const diagnostics: string[] = [];
  const issues: InterpreterDiagnostic[] = [];
  const tree = pythonAstParser.parse(code);
  const nextId = () => `txt_${nodeIndex++}`;
  const nodes = parsePythonBodyNodes(code, tree.topNode, nextId, diagnostics, issues, context);
  const functions: RoboticsProgram["functions"] = [];
  for (const child of context.childrenOf(tree.topNode)) {
    if (child.name !== "FunctionDefinition") continue;
    const fnNameNode = child.getChild("VariableName");
    if (!fnNameNode) continue;
    const fnName = context.textOf(code, fnNameNode).trim();
    const paramListNode = child.getChild("ParamList");
    const paramText = paramListNode ? context.textOf(code, paramListNode) : "()";
    const params = paramText
      .replace(/^\(/, "")
      .replace(/\)$/, "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const bodyNode = child.getChild("Body");
    const body = bodyNode ? parsePythonBodyNodes(code, bodyNode, nextId, diagnostics, issues, context) : [];
    if (fnName === "main") {
      nodes.push(...body);
      continue;
    }
    functions.push({ id: fnName, name: fnName, params, body });
  }
  if (code.trim() && nodes.length === 0) {
    reportPythonIssue(
      diagnostics,
      issues,
      ISSUE_CODES.NO_EXECUTABLE_NODES,
      "semantic",
      "AST parser did not emit executable Python robotics statements.",
    );
  }
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    issues,
    program: { version: 1, entrypoint: "main", nodes, functions },
  };
}

export function parsePythonLegacy(code: string, context: PythonInterpreterContext): TextInterpretResult {
  let nodeIndex = 1;
  const diagnostics: string[] = [];
  const issues: InterpreterDiagnostic[] = [];
  const lines = parsePythonLines(code);
  const parsed = parsePythonBlock(lines, 0, lines[0]?.indent ?? 0, () => `txt_${nodeIndex++}`, diagnostics, issues, context);
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    issues,
    program: { version: 1, entrypoint: "main", nodes: parsed.nodes },
  };
}
