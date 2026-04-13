import type { SyntaxNode } from "@lezer/common";
import { parser as cppAstParser } from "@lezer/cpp";
import type { RoboticsExpression, RoboticsIRNode, RoboticsProgram } from "../../../lib/robotics";
import type { CppInterpreterContext, InterpreterDiagnostic, TextInterpretResult } from "./interpreterTypes";
import { ISSUE_CODES } from "./issueCodes";
import type { IssueCode } from "./issueCodes";

type CppLine = { number: number; text: string };

function reportCppIssue(
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

function normalizeCppCondition(value: string): string {
  return value
    .replace(/\&\&/g, " and ")
    .replace(/\|\|/g, " or ")
    .replace(/!\s*(?!=)/g, " not ")
    .replace(/\btrue\b/g, "True")
    .replace(/\bfalse\b/g, "False");
}

function isChainedComparison(conditionText: string): boolean {
  if (!conditionText) return false;
  if (conditionText.includes("&&") || conditionText.includes("||")) return false;
  const operators = conditionText.match(/(<=|>=|==|!=|<|>)/g) || [];
  return operators.length > 1;
}

function parseCppStatement(
  line: CppLine,
  nextId: () => string,
  diagnostics: string[],
  issues: InterpreterDiagnostic[],
  context: CppInterpreterContext,
): RoboticsIRNode | null {
  let match = line.text.match(/^robot\.move\("([^"]+)",\s*([-+]?\d*\.?\d+),\s*([-+]?\d*\.?\d+)\);$/);
  if (match) {
    return {
      id: nextId(),
      kind: "move",
      direction: (match[1] === "backward" ? "backward" : "forward") as "forward" | "backward",
      unit: "distance_cm",
      value: context.asNumber(match[2]),
      speed_pct: context.asNumber(match[3]),
    };
  }
  match = line.text.match(/^robot\.move_for\("([^"]+)",\s*([-+]?\d*\.?\d+),\s*([-+]?\d*\.?\d+)\);$/);
  if (match) {
    return {
      id: nextId(),
      kind: "move",
      direction: (match[1] === "backward" ? "backward" : "forward") as "forward" | "backward",
      unit: "seconds",
      value: context.asNumber(match[2]),
      speed_pct: context.asNumber(match[3]),
    };
  }
  match = line.text.match(/^robot\.turn\("([^"]+)",\s*([-+]?\d*\.?\d+),\s*([-+]?\d*\.?\d+)\);$/);
  if (match) {
    return {
      id: nextId(),
      kind: "turn",
      direction: (match[1] === "left" ? "left" : "right") as "left" | "right",
      angle_deg: context.asNumber(match[2]),
      speed_pct: context.asNumber(match[3]),
    };
  }
  match = line.text.match(/^robot\.wait\(([-+]?\d*\.?\d+)\);$/);
  if (match) {
    return { id: nextId(), kind: "wait", seconds: context.asNumber(match[1]) };
  }
  match = line.text.match(/^(?:auto|int|float|double|bool)?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*robot\.read_sensor\("([A-Za-z_]+)"\);$/);
  if (match) {
    return {
      id: nextId(),
      kind: "read_sensor",
      output_var: match[1],
      sensor: context.normalizeSensorName(match[2]),
    };
  }
  match = line.text.match(/^return(?:\s+(.+))?;$/);
  if (match) {
    const rawValue = match[1]?.trim();
    if (!rawValue) {
      return { id: nextId(), kind: "return" };
    }
    const expr = context.parseExpression(rawValue);
    if (!expr) {
      reportCppIssue(
        diagnostics,
        issues,
        ISSUE_CODES.UNSUPPORTED_SYNTAX,
        "syntax",
        `Line ${line.number}: unsupported C++ return expression "${rawValue}"`,
        line.number,
      );
      return null;
    }
    return { id: nextId(), kind: "return", value: expr };
  }
  match = line.text.match(/^(?:auto|int|float|double|bool)?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+);$/);
  if (match) {
    const expr = context.parseExpression(match[2]);
    if (!expr) {
      reportCppIssue(
        diagnostics,
        issues,
        ISSUE_CODES.UNSUPPORTED_SYNTAX,
        "syntax",
        `Line ${line.number}: unsupported C++ assignment expression "${match[2]}"`,
        line.number,
      );
      return null;
    }
    return { id: nextId(), kind: "assign", variable: match[1], value: expr };
  }
  match = line.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\);$/);
  if (match) {
    const functionId = match[1];
    const rawArgs = match[2].trim();
    const args: RoboticsExpression[] = [];
    if (rawArgs.length > 0) {
      const parts = context.splitTopLevel(rawArgs, ",");
      for (const part of parts) {
        const expr = context.parseExpression(part);
        if (!expr) {
          reportCppIssue(
            diagnostics,
            issues,
            ISSUE_CODES.UNSUPPORTED_SYNTAX,
            "syntax",
            `Line ${line.number}: unsupported C++ call argument "${part}"`,
            line.number,
          );
          return null;
        }
        args.push(expr);
      }
    }
    return { id: nextId(), kind: "call", function_id: functionId, args };
  }
  reportCppIssue(
    diagnostics,
    issues,
    ISSUE_CODES.UNSUPPORTED_SYNTAX,
    "syntax",
    `Line ${line.number}: unsupported C++ statement "${line.text}"`,
    line.number,
  );
  return null;
}

function parseCppStatementFromAst(
  source: string,
  node: SyntaxNode,
  nextId: () => string,
  diagnostics: string[],
  issues: InterpreterDiagnostic[],
  context: CppInterpreterContext,
): RoboticsIRNode | null {
  const line = context.lineNumberAt(source, node.from);
  const statementText = context.textOf(source, node).trim();
  return parseCppStatement(
    { number: line, text: statementText },
    nextId,
    diagnostics,
    issues,
    context,
  );
}

function parseCppBodyNodes(
  source: string,
  container: SyntaxNode,
  nextId: () => string,
  diagnostics: string[],
  issues: InterpreterDiagnostic[],
  context: CppInterpreterContext,
): RoboticsIRNode[] {
  const nodes: RoboticsIRNode[] = [];
  for (const child of context.childrenOf(container)) {
    if (child.name === "CompoundStatement") {
      nodes.push(...parseCppBodyNodes(source, child, nextId, diagnostics, issues, context));
      continue;
    }
    if (child.name === "ExpressionStatement" || child.name === "Declaration" || child.name === "ReturnStatement") {
      const nextNode = parseCppStatementFromAst(source, child, nextId, diagnostics, issues, context);
      if (nextNode) nodes.push(nextNode);
      continue;
    }
    if (child.name === "IfStatement") {
      const conditionClause = child.getChild("ConditionClause");
      const conditionText = conditionClause
        ? context.textOf(source, conditionClause).replace(/^\(\s*/, "").replace(/\s*\)$/, "")
        : "";
      const normalizedCondition = normalizeCppCondition(conditionText);
      const chainedComparison = isChainedComparison(conditionText);
      const condition = chainedComparison ? null : context.parseCondition(normalizedCondition);
      if (chainedComparison) {
        reportCppIssue(
          diagnostics,
          issues,
          ISSUE_CODES.CPP_UNSUPPORTED_CONSTRUCT,
          "semantic",
          `Line ${context.lineNumberAt(source, child.from)}: unsupported C++ if condition "${conditionText.trim()}" (chained comparisons are not supported in C++; use && to combine comparisons)`,
          context.lineNumberAt(source, child.from),
        );
      }
      if (!condition) {
        if (!chainedComparison) {
          const detail = context.diagnoseCondition(normalizedCondition);
          reportCppIssue(
            diagnostics,
            issues,
            ISSUE_CODES.UNSUPPORTED_SYNTAX,
            "syntax",
            `Line ${context.lineNumberAt(source, child.from)}: unsupported C++ if condition "${conditionText.trim()}"${detail ? ` (${detail})` : ""}`,
            context.lineNumberAt(source, child.from),
          );
        }
      }
      const bodies = child.getChildren("CompoundStatement");
      const thenNodes = bodies[0] ? parseCppBodyNodes(source, bodies[0], nextId, diagnostics, issues, context) : [];
      const elseNodes = bodies[1] ? parseCppBodyNodes(source, bodies[1], nextId, diagnostics, issues, context) : undefined;
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
      const statementText = context.textOf(source, child).trim();
      const match = statementText.match(
        /^for\s*\(\s*(?:int\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*([-+]?\d+)\s*;\s*[^;]*<\s*([-+]?\d+)\s*;\s*[^\)]*\)\s*\{/,
      );
      let times = 0;
      if (match) {
        times = Math.max(0, Math.floor(context.asNumber(match[2]) - context.asNumber(match[1])));
      } else {
        reportCppIssue(
          diagnostics,
          issues,
          ISSUE_CODES.UNSUPPORTED_SYNTAX,
          "syntax",
          `Line ${context.lineNumberAt(source, child.from)}: unsupported C++ for loop "${statementText}"`,
          context.lineNumberAt(source, child.from),
        );
      }
      const body = child.getChild("CompoundStatement");
      nodes.push({
        id: nextId(),
        kind: "repeat",
        times,
        body: body ? parseCppBodyNodes(source, body, nextId, diagnostics, issues, context) : [],
      });
      continue;
    }
    if (child.name === "WhileStatement") {
      const conditionClause = child.getChild("ConditionClause");
      const conditionText = conditionClause
        ? context.textOf(source, conditionClause).replace(/^\(\s*/, "").replace(/\s*\)$/, "")
        : "";
      const normalizedCondition = normalizeCppCondition(conditionText);
      const chainedComparison = isChainedComparison(conditionText);
      const condition = chainedComparison ? null : context.parseCondition(normalizedCondition);
      if (chainedComparison) {
        reportCppIssue(
          diagnostics,
          issues,
          ISSUE_CODES.CPP_UNSUPPORTED_CONSTRUCT,
          "semantic",
          `Line ${context.lineNumberAt(source, child.from)}: unsupported C++ while condition "${conditionText.trim()}" (chained comparisons are not supported in C++; use && to combine comparisons)`,
          context.lineNumberAt(source, child.from),
        );
      }
      if (!condition) {
        if (!chainedComparison) {
          const detail = context.diagnoseCondition(normalizedCondition);
          reportCppIssue(
            diagnostics,
            issues,
            ISSUE_CODES.UNSUPPORTED_SYNTAX,
            "syntax",
            `Line ${context.lineNumberAt(source, child.from)}: unsupported C++ while condition "${conditionText.trim()}"${detail ? ` (${detail})` : ""}`,
            context.lineNumberAt(source, child.from),
          );
        }
      }
      const body = child.getChild("CompoundStatement");
      nodes.push({
        id: nextId(),
        kind: "repeat",
        while: condition ?? context.fallbackFalseCondition(),
        body: body ? parseCppBodyNodes(source, body, nextId, diagnostics, issues, context) : [],
      });
      continue;
    }
  }
  return nodes;
}

function parseCppBlock(
  lines: CppLine[],
  startIndex: number,
  nextId: () => string,
  diagnostics: string[],
  issues: InterpreterDiagnostic[],
  context: CppInterpreterContext,
): { nodes: RoboticsIRNode[]; index: number } {
  const nodes: RoboticsIRNode[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    if (line.text === "}") return { nodes, index: index + 1 };
    if (!line.text || line.text.startsWith("//") || line.text.startsWith("#include ")) {
      index += 1;
      continue;
    }
    if (line.text === "int main() {" || line.text === "{" || line.text === "};") {
      index += 1;
      continue;
    }

    let match = line.text.match(/^if\s*\((.+)\)\s*\{$/);
    if (match) {
      const normalizedCondition = normalizeCppCondition(match[1]);
      const chainedComparison = isChainedComparison(match[1]);
      const condition = chainedComparison ? null : context.parseCondition(normalizedCondition);
      if (!condition) {
        if (chainedComparison) {
          reportCppIssue(
            diagnostics,
            issues,
            ISSUE_CODES.CPP_UNSUPPORTED_CONSTRUCT,
            "semantic",
            `Line ${line.number}: unsupported C++ if condition "${match[1]}" (chained comparisons are not supported in C++; use && to combine comparisons)`,
            line.number,
          );
        } else {
          const detail = context.diagnoseCondition(normalizedCondition);
          reportCppIssue(
            diagnostics,
            issues,
            ISSUE_CODES.UNSUPPORTED_SYNTAX,
            "syntax",
            `Line ${line.number}: unsupported C++ if condition "${match[1]}"${detail ? ` (${detail})` : ""}`,
            line.number,
          );
        }
      }
      const thenParsed = parseCppBlock(lines, index + 1, nextId, diagnostics, issues, context);
      let elseNodes: RoboticsIRNode[] | undefined;
      index = thenParsed.index;
      if (index < lines.length && /^else\s*\{$/.test(lines[index].text)) {
        const elseParsed = parseCppBlock(lines, index + 1, nextId, diagnostics, issues, context);
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

    match = line.text.match(
      /^for\s*\(\s*(?:int\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*([-+]?\d+)\s*;\s*[^;]*<\s*([-+]?\d+)\s*;\s*[^\)]*\)\s*\{$/,
    );
    if (match) {
      const times = Math.max(0, Math.floor(context.asNumber(match[2]) - context.asNumber(match[1])));
      const parsed = parseCppBlock(lines, index + 1, nextId, diagnostics, issues, context);
      nodes.push({ id: nextId(), kind: "repeat", times, body: parsed.nodes });
      index = parsed.index;
      continue;
    }

    match = line.text.match(/^while\s*\((.+)\)\s*\{$/);
    if (match) {
      const normalizedCondition = normalizeCppCondition(match[1]);
      const chainedComparison = isChainedComparison(match[1]);
      const condition = chainedComparison ? null : context.parseCondition(normalizedCondition);
      if (!condition) {
        if (chainedComparison) {
          reportCppIssue(
            diagnostics,
            issues,
            ISSUE_CODES.CPP_UNSUPPORTED_CONSTRUCT,
            "semantic",
            `Line ${line.number}: unsupported C++ while condition "${match[1]}" (chained comparisons are not supported in C++; use && to combine comparisons)`,
            line.number,
          );
        } else {
          const detail = context.diagnoseCondition(normalizedCondition);
          reportCppIssue(
            diagnostics,
            issues,
            ISSUE_CODES.UNSUPPORTED_SYNTAX,
            "syntax",
            `Line ${line.number}: unsupported C++ while condition "${match[1]}"${detail ? ` (${detail})` : ""}`,
            line.number,
          );
        }
      }
      const parsed = parseCppBlock(lines, index + 1, nextId, diagnostics, issues, context);
      nodes.push({
        id: nextId(),
        kind: "repeat",
        while: condition ?? context.fallbackFalseCondition(),
        body: parsed.nodes,
      });
      index = parsed.index;
      continue;
    }

    const node = parseCppStatement(line, nextId, diagnostics, issues, context);
    if (node) nodes.push(node);
    index += 1;
  }
  return { nodes, index };
}

export function parseCppWithAst(code: string, context: CppInterpreterContext): TextInterpretResult {
  let nodeIndex = 1;
  const diagnostics: string[] = [];
  const issues: InterpreterDiagnostic[] = [];
  const tree = cppAstParser.parse(code);
  const nextId = () => `txt_${nodeIndex++}`;
  const functions: RoboticsProgram["functions"] = [];
  let nodes: RoboticsIRNode[] = [];
  const topChildren = context.childrenOf(tree.topNode);
  for (const child of topChildren) {
    if (child.name !== "FunctionDefinition") continue;
    const declarator = child.getChild("FunctionDeclarator");
    const nameNode = declarator?.getChild("Identifier");
    if (!nameNode) continue;
    const fnName = context.textOf(code, nameNode).trim();
    const paramListNode = declarator?.getChild("ParameterList");
    const paramText = paramListNode ? context.textOf(code, paramListNode) : "()";
    const params = paramText
      .replace(/^\(/, "")
      .replace(/\)$/, "")
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => token.split(/\s+/).filter(Boolean).pop() || token);
    const bodyNode = child.getChild("CompoundStatement");
    const body = bodyNode ? parseCppBodyNodes(code, bodyNode, nextId, diagnostics, issues, context) : [];
    if (fnName === "main") {
      nodes = body;
      continue;
    }
    functions.push({ id: fnName, name: fnName, params, body });
  }
  if (nodes.length === 0) {
    nodes = parseCppBodyNodes(code, tree.topNode, nextId, diagnostics, issues, context);
  }
  if (code.trim() && nodes.length === 0) {
    reportCppIssue(
      diagnostics,
      issues,
      ISSUE_CODES.NO_EXECUTABLE_NODES,
      "semantic",
      "AST parser did not emit executable C++ robotics statements.",
    );
  }
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    issues,
    program: { version: 1, entrypoint: "main", nodes, functions },
  };
}

export function parseCppLegacy(code: string, context: CppInterpreterContext): TextInterpretResult {
  let nodeIndex = 1;
  const diagnostics: string[] = [];
  const issues: InterpreterDiagnostic[] = [];
  const lines: CppLine[] = code.split(/\r?\n/).map((raw, i) => ({ number: i + 1, text: raw.trim() }));
  const parsed = parseCppBlock(lines, 0, () => `txt_${nodeIndex++}`, diagnostics, issues, context);
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    issues,
    program: { version: 1, entrypoint: "main", nodes: parsed.nodes },
  };
}
