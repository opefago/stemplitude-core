import type {
  RoboticsCodeMode,
  RoboticsCondition,
  RoboticsExpression,
  RoboticsIRNode,
  RoboticsProgram,
  SensorKind,
} from "../../../lib/robotics";

export interface TextInterpretResult {
  ok: boolean;
  program: RoboticsProgram;
  diagnostics: string[];
}

function emptyProgram(): RoboticsProgram {
  return { version: 1, entrypoint: "main", nodes: [] };
}

function asNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

type PythonLine = { number: number; indent: number; raw: string; text: string };
type CppLine = { number: number; text: string };

function splitTopLevel(input: string, needle: string): string[] {
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

function normalizeSensorName(sensor: string): SensorKind {
  return sensor as SensorKind;
}

function parseExpression(value: string): RoboticsExpression | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[-+]?\d*\.?\d+$/.test(trimmed)) return { type: "number", value: asNumber(trimmed) };
  if (/^(true|True)$/.test(trimmed)) return { type: "boolean", value: true };
  if (/^(false|False)$/.test(trimmed)) return { type: "boolean", value: false };
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return { type: "string", value: trimmed.slice(1, -1) };
  }
  let match = trimmed.match(/^robot\.read_sensor\("([A-Za-z_]+)"\)$/);
  if (match) return { type: "sensor", sensor: normalizeSensorName(match[1]) };
  match = trimmed.match(/^robot\.read_sensor\('([A-Za-z_]+)'\)$/);
  if (match) return { type: "sensor", sensor: normalizeSensorName(match[1]) };
  match = trimmed.match(/^robot\.read_sensor\("([A-Za-z_]+)"\)$/);
  if (match) return { type: "sensor", sensor: normalizeSensorName(match[1]) };
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) return { type: "var", name: trimmed };
  return null;
}

function parseComparisonCondition(raw: string): RoboticsCondition | null {
  const comparisonOps = ["==", ">", "<"];
  for (const op of comparisonOps) {
    const [left, right] = splitTopLevel(raw, op);
    if (!left || !right || splitTopLevel(raw, op).length !== 2) continue;
    const leftExpr = parseExpression(left);
    const rightExpr = parseExpression(right);
    if (!leftExpr || !rightExpr) return null;
    if (op === "==") {
      return { op: "eq", left: leftExpr, right: rightExpr };
    }
    if (op === ">" || op === "<") {
      if (leftExpr.type === "sensor" && rightExpr.type === "number") {
        return {
          op: op === ">" ? "sensor_gt" : "sensor_lt",
          sensor: leftExpr.sensor,
          value: rightExpr.value,
        };
      }
      if (rightExpr.type === "sensor" && leftExpr.type === "number") {
        return {
          op: op === ">" ? "sensor_lt" : "sensor_gt",
          sensor: rightExpr.sensor,
          value: leftExpr.value,
        };
      }
    }
  }
  return null;
}

function parseCondition(rawValue: string): RoboticsCondition | null {
  const raw = rawValue.trim();
  if (!raw) return null;
  const withoutOuter = raw.startsWith("(") && raw.endsWith(")") ? raw.slice(1, -1).trim() : raw;

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

function parsePythonStatement(
  line: PythonLine,
  nextId: () => string,
  diagnostics: string[],
): RoboticsIRNode | null {
  let match = line.text.match(/^robot\.move_(forward|backward)\(([-+]?\d*\.?\d+),\s*speed_pct=([-+]?\d*\.?\d+)\)$/);
  if (match) {
    return {
      id: nextId(),
      kind: "move",
      direction: match[1] as "forward" | "backward",
      unit: "distance_cm",
      value: asNumber(match[2]),
      speed_pct: asNumber(match[3]),
    };
  }
  match = line.text.match(/^robot\.move_(forward|backward)_for\(([-+]?\d*\.?\d+),\s*speed_pct=([-+]?\d*\.?\d+)\)$/);
  if (match) {
    return {
      id: nextId(),
      kind: "move",
      direction: match[1] as "forward" | "backward",
      unit: "seconds",
      value: asNumber(match[2]),
      speed_pct: asNumber(match[3]),
    };
  }
  match = line.text.match(/^robot\.turn_(left|right)\(([-+]?\d*\.?\d+),\s*speed_pct=([-+]?\d*\.?\d+)\)$/);
  if (match) {
    return {
      id: nextId(),
      kind: "turn",
      direction: match[1] as "left" | "right",
      angle_deg: asNumber(match[2]),
      speed_pct: asNumber(match[3]),
    };
  }
  match = line.text.match(/^robot\.wait\(([-+]?\d*\.?\d+)\)$/);
  if (match) {
    return { id: nextId(), kind: "wait", seconds: asNumber(match[1]) };
  }
  match = line.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*robot\.read_sensor\("([A-Za-z_]+)"\)$/);
  if (match) {
    return {
      id: nextId(),
      kind: "read_sensor",
      output_var: match[1],
      sensor: normalizeSensorName(match[2]),
    };
  }
  match = line.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
  if (match) {
    const expr = parseExpression(match[2]);
    if (!expr) {
      diagnostics.push(`Line ${line.number}: unsupported assignment expression "${match[2]}"`);
      return null;
    }
    return { id: nextId(), kind: "assign", variable: match[1], value: expr };
  }
  diagnostics.push(`Line ${line.number}: unsupported Python statement "${line.text}"`);
  return null;
}

function parsePythonBlock(
  lines: PythonLine[],
  startIndex: number,
  indent: number,
  nextId: () => string,
  diagnostics: string[],
): { nodes: RoboticsIRNode[]; index: number } {
  const nodes: RoboticsIRNode[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      diagnostics.push(`Line ${line.number}: unexpected indentation`);
      index += 1;
      continue;
    }

    let match = line.text.match(/^if\s+(.+):$/);
    if (match) {
      const condition = parseCondition(match[1]);
      if (!condition) diagnostics.push(`Line ${line.number}: unsupported if condition "${match[1]}"`);
      const thenIndent = lines[index + 1]?.indent ?? indent + 2;
      const thenParsed = parsePythonBlock(lines, index + 1, thenIndent, nextId, diagnostics);
      let elseNodes: RoboticsIRNode[] | undefined;
      index = thenParsed.index;
      if (index < lines.length && lines[index].indent === indent && /^else:\s*$/.test(lines[index].text)) {
        const elseIndent = lines[index + 1]?.indent ?? indent + 2;
        const elseParsed = parsePythonBlock(lines, index + 1, elseIndent, nextId, diagnostics);
        elseNodes = elseParsed.nodes;
        index = elseParsed.index;
      }
      nodes.push({
        id: nextId(),
        kind: "if",
        condition: condition ?? { op: "eq", left: { type: "boolean", value: false }, right: { type: "boolean", value: true } },
        then_nodes: thenParsed.nodes,
        else_nodes: elseNodes,
      });
      continue;
    }

    match = line.text.match(/^for\s+[A-Za-z_][A-Za-z0-9_]*\s+in\s+range\(([-+]?\d+)\):$/);
    if (match) {
      const bodyIndent = lines[index + 1]?.indent ?? indent + 2;
      const parsed = parsePythonBlock(lines, index + 1, bodyIndent, nextId, diagnostics);
      nodes.push({
        id: nextId(),
        kind: "repeat",
        times: Math.max(0, Math.floor(asNumber(match[1]))),
        body: parsed.nodes,
      });
      index = parsed.index;
      continue;
    }

    match = line.text.match(/^while\s+(.+):$/);
    if (match) {
      const condition = parseCondition(match[1]);
      if (!condition) diagnostics.push(`Line ${line.number}: unsupported while condition "${match[1]}"`);
      const bodyIndent = lines[index + 1]?.indent ?? indent + 2;
      const parsed = parsePythonBlock(lines, index + 1, bodyIndent, nextId, diagnostics);
      nodes.push({
        id: nextId(),
        kind: "repeat",
        while: condition ?? { op: "eq", left: { type: "boolean", value: false }, right: { type: "boolean", value: true } },
        body: parsed.nodes,
      });
      index = parsed.index;
      continue;
    }

    const node = parsePythonStatement(line, nextId, diagnostics);
    if (node) nodes.push(node);
    index += 1;
  }
  return { nodes, index };
}

function parsePython(code: string): TextInterpretResult {
  let nodeIndex = 1;
  const diagnostics: string[] = [];
  const lines = parsePythonLines(code);
  const parsed = parsePythonBlock(lines, 0, lines[0]?.indent ?? 0, () => `txt_${nodeIndex++}`, diagnostics);
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    program: { version: 1, entrypoint: "main", nodes: parsed.nodes },
  };
}

function normalizeCppCondition(value: string): string {
  return value
    .replace(/\&\&/g, " and ")
    .replace(/\|\|/g, " or ")
    .replace(/!\s*(?!=)/g, " not ")
    .replace(/\btrue\b/g, "True")
    .replace(/\bfalse\b/g, "False");
}

function parseCppStatement(line: CppLine, nextId: () => string, diagnostics: string[]): RoboticsIRNode | null {
  let match = line.text.match(/^robot\.move\("([^"]+)",\s*([-+]?\d*\.?\d+),\s*([-+]?\d*\.?\d+)\);$/);
  if (match) {
    return {
      id: nextId(),
      kind: "move",
      direction: (match[1] === "backward" ? "backward" : "forward") as "forward" | "backward",
      unit: "distance_cm",
      value: asNumber(match[2]),
      speed_pct: asNumber(match[3]),
    };
  }
  match = line.text.match(/^robot\.move_for\("([^"]+)",\s*([-+]?\d*\.?\d+),\s*([-+]?\d*\.?\d+)\);$/);
  if (match) {
    return {
      id: nextId(),
      kind: "move",
      direction: (match[1] === "backward" ? "backward" : "forward") as "forward" | "backward",
      unit: "seconds",
      value: asNumber(match[2]),
      speed_pct: asNumber(match[3]),
    };
  }
  match = line.text.match(/^robot\.turn\("([^"]+)",\s*([-+]?\d*\.?\d+),\s*([-+]?\d*\.?\d+)\);$/);
  if (match) {
    return {
      id: nextId(),
      kind: "turn",
      direction: (match[1] === "left" ? "left" : "right") as "left" | "right",
      angle_deg: asNumber(match[2]),
      speed_pct: asNumber(match[3]),
    };
  }
  match = line.text.match(/^robot\.wait\(([-+]?\d*\.?\d+)\);$/);
  if (match) {
    return { id: nextId(), kind: "wait", seconds: asNumber(match[1]) };
  }
  match = line.text.match(/^(?:auto|int|float|double|bool)?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*robot\.read_sensor\("([A-Za-z_]+)"\);$/);
  if (match) {
    return {
      id: nextId(),
      kind: "read_sensor",
      output_var: match[1],
      sensor: normalizeSensorName(match[2]),
    };
  }
  match = line.text.match(/^(?:auto|int|float|double|bool)?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+);$/);
  if (match) {
    const expr = parseExpression(match[2]);
    if (!expr) {
      diagnostics.push(`Line ${line.number}: unsupported C++ assignment expression "${match[2]}"`);
      return null;
    }
    return { id: nextId(), kind: "assign", variable: match[1], value: expr };
  }
  diagnostics.push(`Line ${line.number}: unsupported C++ statement "${line.text}"`);
  return null;
}

function parseCppBlock(
  lines: CppLine[],
  startIndex: number,
  nextId: () => string,
  diagnostics: string[],
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
    if (line.text === "int main() {" || line.text === "{" || line.text === "return 0;" || line.text === "};") {
      index += 1;
      continue;
    }

    let match = line.text.match(/^if\s*\((.+)\)\s*\{$/);
    if (match) {
      const condition = parseCondition(normalizeCppCondition(match[1]));
      if (!condition) diagnostics.push(`Line ${line.number}: unsupported C++ if condition "${match[1]}"`);
      const thenParsed = parseCppBlock(lines, index + 1, nextId, diagnostics);
      let elseNodes: RoboticsIRNode[] | undefined;
      index = thenParsed.index;
      if (index < lines.length && /^else\s*\{$/.test(lines[index].text)) {
        const elseParsed = parseCppBlock(lines, index + 1, nextId, diagnostics);
        elseNodes = elseParsed.nodes;
        index = elseParsed.index;
      }
      nodes.push({
        id: nextId(),
        kind: "if",
        condition: condition ?? { op: "eq", left: { type: "boolean", value: false }, right: { type: "boolean", value: true } },
        then_nodes: thenParsed.nodes,
        else_nodes: elseNodes,
      });
      continue;
    }

    match = line.text.match(
      /^for\s*\(\s*(?:int\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*([-+]?\d+)\s*;\s*[^;]*<\s*([-+]?\d+)\s*;\s*[^\)]*\)\s*\{$/,
    );
    if (match) {
      const times = Math.max(0, Math.floor(asNumber(match[2]) - asNumber(match[1])));
      const parsed = parseCppBlock(lines, index + 1, nextId, diagnostics);
      nodes.push({ id: nextId(), kind: "repeat", times, body: parsed.nodes });
      index = parsed.index;
      continue;
    }

    match = line.text.match(/^while\s*\((.+)\)\s*\{$/);
    if (match) {
      const condition = parseCondition(normalizeCppCondition(match[1]));
      if (!condition) diagnostics.push(`Line ${line.number}: unsupported C++ while condition "${match[1]}"`);
      const parsed = parseCppBlock(lines, index + 1, nextId, diagnostics);
      nodes.push({
        id: nextId(),
        kind: "repeat",
        while: condition ?? { op: "eq", left: { type: "boolean", value: false }, right: { type: "boolean", value: true } },
        body: parsed.nodes,
      });
      index = parsed.index;
      continue;
    }

    const node = parseCppStatement(line, nextId, diagnostics);
    if (node) nodes.push(node);
    index += 1;
  }
  return { nodes, index };
}

function parseCpp(code: string): TextInterpretResult {
  let nodeIndex = 1;
  const diagnostics: string[] = [];
  const lines: CppLine[] = code.split(/\r?\n/).map((raw, i) => ({ number: i + 1, text: raw.trim() }));
  const parsed = parseCppBlock(lines, 0, () => `txt_${nodeIndex++}`, diagnostics);
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    program: { version: 1, entrypoint: "main", nodes: parsed.nodes },
  };
}

export function interpretTextProgram(code: string, mode: RoboticsCodeMode): TextInterpretResult {
  if (!code.trim()) {
    return {
      ok: false,
      diagnostics: ["Text editor is empty; nothing to run in simulator."],
      program: emptyProgram(),
    };
  }
  if (mode === "python") return parsePython(code);
  if (mode === "cpp") return parseCpp(code);
  return {
    ok: false,
    diagnostics: [`Interpreter only supports text modes (python/cpp). Received mode: ${mode}`],
    program: emptyProgram(),
  };
}
